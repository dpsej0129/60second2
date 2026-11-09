// 실제 브라우저에서 화면을 눌러 가며 끝까지 플레이하는 검증 스크립트.
//   npm run test:e2e
// Playwright(Chromium)가 설치되어 있어야 한다. 없으면 건너뛴다.
//
// 실시간 구간은 키보드 이벤트로, 집 화면은 버튼·체크박스 클릭으로만 조작한다.
// 무엇을 고를지는 tests/helpers/strategy.mjs 가 정하고(페이지 안에서 불러 씀),
// 실제 입력은 화면을 통해 넣는다.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.E2E_OUT ?? join(here, 'output');

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('playwright를 찾을 수 없어 E2E 검증을 건너뜁니다.');
  process.exit(0);
}

const log = (...args) => console.log(...args);

/** 페이지 안에서 봇을 돌려 키보드 이벤트로 실시간 구간을 플레이한다. */
async function driveRun(page, itemIds) {
  return page.evaluate(async (items) => {
    const { RunBot, shelvesFor } = await import('/tests/helpers/bot.mjs');
    const game = window.game;
    const bot = new RunBot(shelvesFor(items, game.martStock), { arriveDistance: 10 });
    const held = new Set();
    const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    const prompts = new Set();
    const times = [];
    return new Promise((resolve) => {
      const tick = () => {
        if (game.phase !== 'run') {
          for (const code of held) send('keyup', code);
          resolve({ outcome: game.lastRun?.outcome, prompts: [...prompts], times, carried: game.lastRun?.carried });
          return;
        }
        const run = game.run;
        const promptEl = document.querySelector('[data-ref="prompt"]');
        if (promptEl && !promptEl.hidden && /칸 필요/.test(promptEl.textContent)) prompts.add(promptEl.textContent.trim());
        times.push(Number(document.querySelector('[data-ref="time"]').textContent));
        const input = bot.next(run);
        const want = new Set();
        if (input.mx < -0.38) want.add('ArrowLeft');
        if (input.mx > 0.38) want.add('ArrowRight');
        if (input.my < -0.38) want.add('ArrowUp');
        if (input.my > 0.38) want.add('ArrowDown');
        for (const code of [...held]) {
          if (!want.has(code)) {
            send('keyup', code);
            held.delete(code);
          }
        }
        for (const code of want) {
          if (!held.has(code)) {
            send('keydown', code);
            held.add(code);
          }
        }
        if (input.interact) {
          send('keydown', 'KeyE');
          send('keyup', 'KeyE');
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, itemIds);
}

const strategy = (page, fn, ...args) =>
  page.evaluate(
    async ({ fn, args }) => {
      const s = await import('/tests/helpers/strategy.mjs');
      return s[fn](window.game, ...args);
    },
    { fn, args },
  );

async function waitScreen(page, ...names) {
  const selector = names.map((n) => `[data-screen="${n}"]`).join(',');
  await page.waitForSelector(selector, { timeout: 120000 });
  return page.$eval(selector, (el) => el.dataset.screen);
}

const text = (page, selector) => page.$eval(selector, (el) => el.textContent.replace(/\s+/g, ' ').trim());

/**
 * 게임 하나를 처음부터 결말까지 플레이한다.
 * 반환: { ending, checks }
 */
async function playThrough(page, { baseUrl, seed, target, zombies, timescale, shotPrefix, bring = ['dad', 'mom', 'sis'] }) {
  const checks = {};
  await page.goto(`${baseUrl}/?seed=${seed}&debug=1&timescale=${timescale}${zombies ? '' : '&zombies=off'}`);
  await page.click('button[type=submit]');
  await waitScreen(page, 'run');
  assert.equal(await text(page, '[data-ref="time"]'), '60.0', '시작 전에는 60초 그대로');
  await page.waitForTimeout(400);
  assert.equal(await text(page, '[data-ref="time"]'), '60.0', '카운트다운 시작 전에는 시간이 흐르지 않는다');
  assert.ok(await page.evaluate(() => window.game.phase === 'ready'));
  if (shotPrefix) await page.screenshot({ path: join(OUT, `${shotPrefix}-1-briefing.png`) });

  // 실제 키보드로 시작하고 움직여 본다
  await page.keyboard.press('Enter');
  const before = await page.evaluate(() => ({ ...window.game.run.player }));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowUp');
  const after = await page.evaluate(() => ({ ...window.game.run.player, inMart: window.game.run.player.x < 664 }));
  assert.ok(after.y < before.y, '방향키로 이동한다');
  assert.ok(after.inMart, '마트 안에서 시작한다');

  const firstItems = await page.evaluate(async (t) => (await import('/tests/helpers/strategy.mjs')).firstRunItems(t), target);
  const first = await driveRun(page, firstItems);
  checks.firstRun = first.outcome;
  checks.pickupPrompts = first.prompts.slice(0, 3);
  assert.ok(first.prompts.length > 0, '집기 전에 필요한 칸 수가 표시된다');
  assert.ok(first.times[0] > first.times.at(-1), '남은 시간이 줄어든다');
  if (shotPrefix) await page.screenshot({ path: join(OUT, `${shotPrefix}-2-run.png`) });

  let screen = await waitScreen(page, 'family', 'ending');
  if (screen === 'ending') return { ending: await page.evaluate(() => window.game.ending), checks };

  // 가족 선택: 한 명씩
  let familyShot = false;
  for (let picks = 0; (await waitScreen(page, 'family', 'home')) === 'family'; picks++) {
    assert.ok(picks < 3, '가족 3명을 고른 뒤에는 집 화면으로 넘어가야 한다');
    const id = await page.$eval('[data-action="family"]', (el) => el.dataset.person);
    if (shotPrefix && !familyShot) {
      await page.screenshot({ path: join(OUT, `${shotPrefix}-3-family.png`) });
      familyShot = true;
    }
    await page.click(`[data-action="family"][data-person="${id}"][data-bring="${bring.includes(id) ? 1 : 0}"]`);
  }
  const need = await text(page, '.need');
  checks.need = need;
  assert.match(need, new RegExp(`하루 필요량 식량 ${bring.length + 1} · 물 ${bring.length + 1}`), '가족 수만큼 필요량이 늘어난다');

  let homeShot = false;
  let pathShot = false;
  for (let guard = 0; guard < 60; guard++) {
    screen = await waitScreen(page, 'home', 'ending');
    if (screen === 'ending') break;

    // 가방 → 재고
    if (await page.$('[data-action="deposit-all"]')) {
      const stockBefore = await page.evaluate(() => ({ ...window.game.stock }));
      const items = await page.evaluate(() => [...window.game.inventory.items]);
      await page.click('[data-action="deposit-all"]');
      const stockAfter = await page.evaluate(() => ({ ...window.game.stock }));
      const gained = Object.keys(stockAfter).reduce((sum, k) => sum + (stockAfter[k] - stockBefore[k]), 0);
      assert.ok(gained > 0, `재고로 옮겼다: ${items.join(', ')}`);
      assert.equal(await page.evaluate(() => window.game.inventory.items.length), 0, '가방이 비었다');
      checks.deposits = (checks.deposits ?? 0) + 1;
    }

    // 오늘의 사건
    if (await page.$('[data-ref="event"].pending')) {
      if (shotPrefix && !homeShot) {
        await page.screenshot({ path: join(OUT, `${shotPrefix}-4-home-event.png`), fullPage: true });
        homeShot = true;
      }
      const option = await strategy(page, 'chooseOption', target);
      await page.click(`[data-action="choose"][data-option="${option}"]`);
      if (await page.evaluate(() => window.game.phase === 'ending')) break;
    } else if (await page.$('[data-ref="event"].quiet')) {
      checks.quietNote = await text(page, '[data-ref="event"] .muted');
    }

    if (shotPrefix && !pathShot && (await page.$('.path.open'))) {
      await page.screenshot({ path: join(OUT, `${shotPrefix}-5-path-open.png`), fullPage: true });
      pathShot = true;
      checks.pathNext = await text(page, '.path.open .next');
    }

    // 보급
    if (await strategy(page, 'shouldRun', target)) {
      const plan = await strategy(page, 'planSupply', target);
      await page.click('[data-action="supply"]');
      await waitScreen(page, 'run');
      assert.equal(await page.evaluate(() => window.game.run.mode), 'supply');
      const result = await driveRun(page, plan);
      checks.supplyRuns = (checks.supplyRuns ?? 0) + 1;
      checks.supplyStartTimes ??= [];
      checks.supplyStartTimes.push(result.times[0]);
      screen = await waitScreen(page, 'home', 'ending');
      if (screen === 'ending') break;
      assert.ok(await page.$('[data-action="supply"][disabled]'), '하루에 한 번만 보급을 나갈 수 있다');
      continue; // 가방 정리부터 다시
    }

    // 치료(버튼)
    for (let i = 0; i < 10; i++) {
      const next = await strategy(page, 'nextTreatment', target);
      if (!next) break;
      await page.click(`[data-action="${next.action}"][data-person="${next.person}"]`);
    }

    // 배급(체크박스)
    for (let i = 0; i < 20; i++) {
      const diff = await page.evaluate(async (t) => {
        const s = await import('/tests/helpers/strategy.mjs');
        const plan = s.desiredRations(window.game, t);
        const order = [];
        for (const [id, want] of Object.entries(plan)) {
          for (const kind of ['food', 'water']) {
            const has = !!window.game.rations[id]?.[kind];
            if (has !== want[kind]) order.push({ id, kind, want: want[kind] });
          }
        }
        order.sort((a, b) => Number(a.want) - Number(b.want)); // 먼저 끄고 나중에 켠다
        return order[0] ?? null;
      }, target);
      if (!diff) break;
      await page.click(`input[data-action="ration"][data-person="${diff.id}"][data-kind="${diff.kind}"]`);
    }

    const before = await page.evaluate(() => ({ day: window.game.day, food: window.game.stock.food, water: window.game.stock.water, f: window.game.rationCount('food'), w: window.game.rationCount('water') }));
    await page.click('[data-action="end-day"]');
    const after = await page.evaluate(() => ({ day: window.game.day, food: window.game.stock.food, water: window.game.stock.water, phase: window.game.phase, event: window.game.event?.defId }));
    if (after.phase === 'home') {
      assert.equal(after.day, before.day + 1);
      // 다음 날 사건은 아직 해결 전이라 재고 변화는 오직 밤사이 배급 소비다
      assert.equal(before.food - after.food, before.f, '배급한 식량만큼 소비');
      assert.equal(before.water - after.water, before.w, '배급한 물만큼 소비');
      checks.consumption ??= [];
      if (checks.consumption.length < 3) checks.consumption.push(`${before.day}일: 식량 -${before.f} 물 -${before.w}`);
    }
  }
  return { ending: await page.evaluate(() => window.game.ending), checks };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await startServer(0);
  const baseUrl = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const results = [];

  try {
    // 1) 좀비 없이 세 경로를 각각 끝까지 (흐름·조건 검증)
    for (const [target, seed] of [
      ['rescue', 101],
      ['group', 202],
      ['car', 303],
    ]) {
      const { ending, checks } = await playThrough(page, { baseUrl, seed, target, zombies: false, timescale: 4, shotPrefix: target === 'rescue' ? 'flow' : null });
      log(`[좀비 없음] ${target} seed ${seed}: ${ending?.id} (${ending?.day}일차, 보급 ${ending?.runs}회)`, JSON.stringify(checks));
      assert.equal(ending?.id, target, `${target} 경로로 승리해야 한다`);
      results.push({ target, seed, zombies: false, ending: ending.id });
      if (target === 'rescue') await page.screenshot({ path: join(OUT, 'flow-6-ending.png') });
    }

    // 2) 좀비가 있는 실제 난이도로 플레이 (결과는 승리든 패배든 결말까지 가야 한다)
    const zombieEndings = [];
    for (const [target, seed] of [
      ['rescue', 11],
      ['group', 12],
      ['rescue', 13],
    ]) {
      const { ending, checks } = await playThrough(page, { baseUrl, seed, target, zombies: true, timescale: 3, shotPrefix: zombieEndings.length ? null : 'zombie' });
      log(`[좀비 있음] ${target} seed ${seed}: ${ending?.id} (${ending?.type}, ${ending?.day}일차, 보급 ${ending?.runs}회)`, JSON.stringify(checks));
      assert.ok(ending, '결말에 도달한다');
      zombieEndings.push(ending.id);
      results.push({ target, seed, zombies: true, ending: ending.id });
    }

    // 3) 결말 화면에서 다시 시작
    await waitScreen(page, 'ending');
    await page.screenshot({ path: join(OUT, 'restart-1-ending.png') });
    const oldSeed = await page.evaluate(() => window.game.seed);
    await page.click('[data-action="same-seed"]');
    await waitScreen(page, 'run');
    const fresh = await page.evaluate(() => ({ seed: window.game.seed, phase: window.game.phase, day: window.game.day, items: window.game.inventory.items.length }));
    assert.deepEqual(fresh, { seed: oldSeed, phase: 'ready', day: 0, items: 0 });

    // 4) 첫 보급에서 가만히 있으면 60초 뒤 시간 초과 패배 → 새 게임
    await page.goto(`${baseUrl}/?seed=5&debug=1&timescale=6&zombies=off`);
    await page.click('button[type=submit]');
    await waitScreen(page, 'run');
    await page.keyboard.press('Enter');
    await waitScreen(page, 'ending');
    const timeout = await page.evaluate(() => window.game.ending);
    assert.equal(timeout.id, 'timeout');
    log(`[시간 초과] ${timeout.title}: ${timeout.text}`);
    await page.click('[data-action="new-game"]');
    await waitScreen(page, 'run');
    const newSeed = await page.evaluate(() => window.game.seed);
    assert.notEqual(newSeed, oldSeed, '새 게임은 새 시드');

    assert.deepEqual(errors, [], '브라우저 콘솔 오류 없음');
    log('\nE2E 결과', JSON.stringify(results));
    log(`스크린샷: ${OUT}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
