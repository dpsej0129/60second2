// 실제 브라우저에서 화면을 눌러 가며 끝까지 플레이하는 검증 스크립트.
//   npm run test:e2e
// Playwright(Chromium)가 설치되어 있어야 한다. 없으면 건너뛴다.
//
// 60초 탐색은 키보드 이벤트로, 집 화면은 버튼·라디오·선택 상자·체크박스 클릭으로만 조작한다.
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

/** 페이지 안에서 봇을 돌려 키보드 이벤트로 60초 탐색을 플레이한다. */
async function driveScramble(page, target, bring) {
  return page.evaluate(
    async ({ target, bring }) => {
      const { RunBot, scramblePlan } = await import('/tests/helpers/bot.mjs');
      const { scrambleLegs } = await import('/tests/helpers/strategy.mjs');
      const game = window.game;
      const bot = new RunBot(scramblePlan(scrambleLegs(target, bring), game.martStock), { arriveDistance: 10 });
      const held = new Set();
      const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
      const prompts = new Set();
      const times = [];
      const deliveries = []; // [남은 시간, 들여놓은 누적 수] — 들여놓은 뒤에도 탐색이 이어지는지
      let lastDelivered = 0;
      return new Promise((resolve) => {
        const tick = () => {
          if (game.phase !== 'run') {
            for (const code of held) send('keyup', code);
            resolve({ ...game.lastRun, prompts: [...prompts], times, deliveries });
            return;
          }
          const run = game.run;
          if (run.delivered.length !== lastDelivered) {
            lastDelivered = run.delivered.length;
            deliveries.push([run.timeLeft, lastDelivered]);
          }
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
    },
    { target, bring },
  );
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

/** 게임 하나를 처음부터 결말까지 플레이한다. 반환: { ending, checks } */
async function playThrough(page, { baseUrl, seed, target, zombies, timescale, shotPrefix, bring = ['dad', 'mom', 'sis'] }) {
  const checks = {};
  const shot = async (name, fullPage = false) => {
    if (shotPrefix) await page.screenshot({ path: join(OUT, `${shotPrefix}-${name}.png`), fullPage });
  };
  await page.goto(`${baseUrl}/?seed=${seed}&debug=1&timescale=${timescale}${zombies ? '' : '&zombies=off'}`);
  await page.click('button[type=submit]');
  await waitScreen(page, 'run');
  assert.equal(await text(page, '[data-ref="time"]'), '60.0', '시작 전에는 60초 그대로');
  await page.waitForTimeout(400);
  assert.equal(await text(page, '[data-ref="time"]'), '60.0', '카운트다운 시작 전에는 시간이 흐르지 않는다');
  await shot('1-briefing');

  // 실제 키보드로 시작하고 움직여 본다
  await page.keyboard.press('Enter');
  const before = await page.evaluate(() => ({ ...window.game.run.player }));
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowUp');
  const after = await page.evaluate(() => ({ ...window.game.run.player, inMart: window.game.run.player.x < 664 }));
  assert.ok(after.y < before.y, '방향키로 이동한다');
  assert.ok(after.inMart, '마트 안에서 시작한다');

  const scramble = await driveScramble(page, target, bring);
  checks.scramble = `${scramble.outcome}/${scramble.endedBy ?? '-'} 물품 ${scramble.items?.length ?? 0} 가족 ${scramble.family?.join(',') || '없음'} 남은 ${scramble.timeLeft?.toFixed(1)}초`;
  checks.pickupPrompts = scramble.prompts.filter((p, i, all) => /데려가기|부축/.test(p) || i < 2).slice(0, 3);
  assert.ok(scramble.prompts.length > 0, '집기 전에 필요한 칸 수가 표시된다');
  assert.ok(scramble.times[0] > scramble.times.at(-1), '남은 시간이 줄어든다');
  if (scramble.outcome === 'home' && scramble.deliveries.length > 1) {
    assert.ok(scramble.deliveries[0][0] > scramble.deliveries.at(-1)[0], '집에 내려놓은 뒤에도 탐색이 이어졌다');
    checks.deliveries = scramble.deliveries.map(([t, n]) => `${t.toFixed(0)}초에 누적 ${n}`).join(', ');
  }
  await shot('2-scramble-end');

  let screen = await waitScreen(page, 'home', 'ending');
  if (screen === 'ending') return { ending: await page.evaluate(() => window.game.ending), checks };

  const present = await page.evaluate(() => window.game.presentPeople().map((p) => p.id));
  for (const id of present) assert.ok(await page.$(`[data-ref="shelter"] [data-person="${id}"]`), `집 안 장면에 ${id}`);
  const need = await text(page, '.need');
  assert.match(need, new RegExp(`하루 필요량 식량 ${present.length} · 물 ${present.length}`), '집에 있는 사람 수만큼 필요량');
  checks.need = need.split('·').slice(0, 2).join('·');

  let homeShot = false;
  let pathShot = false;
  let reportShot = false;
  for (let guard = 0; guard < 60; guard++) {
    screen = await waitScreen(page, 'home', 'ending');
    if (screen === 'ending') break;

    if (await page.$('[data-ref="report"]')) {
      checks.reports = (checks.reports ?? 0) + 1;
      if (!reportShot) {
        await shot('5-expedition-report', true);
        reportShot = true;
        checks.firstReport = await text(page, '[data-ref="report"]');
      }
    }

    // 오늘의 사건
    if (await page.$('[data-ref="event"].pending')) {
      if (!homeShot) {
        await shot('3-home-event', true);
        homeShot = true;
      }
      const option = await strategy(page, 'chooseOption', target);
      await page.click(`[data-action="choose"][data-option="${option}"]`);
      if (await page.evaluate(() => window.game.phase === 'ending')) break;
    } else if (await page.$('[data-ref="event"].quiet')) {
      checks.quietNote = await text(page, '[data-ref="event"] .muted');
    }

    if (!pathShot && (await page.$('.path.open'))) {
      await shot('4-path-open', true);
      pathShot = true;
      checks.pathNext = await text(page, '.path.open .next');
    }

    // 탐사(라디오·선택 상자·체크박스·버튼)
    const plan = await strategy(page, 'expeditionPlan', target);
    if (plan) {
      await page.click(`input[data-draft="memberId"][value="${plan.memberId}"]`);
      await page.selectOption('select[data-draft="targetId"]', plan.targetId);
      const weapon = await page.$('input[data-draft="withWeapon"]');
      if (weapon && plan.withWeapon !== (await weapon.isChecked())) await weapon.click();
      await page.click('[data-action="send-expedition"]');
      const exp = await page.evaluate(() => window.game.expedition);
      assert.equal(exp.memberId, plan.memberId, '고른 사람이 탐사를 떠났다');
      assert.equal(exp.targetId, plan.targetId, '고른 물건을 찾으러 갔다');
      assert.ok(!(await page.$(`[data-ref="shelter"] [data-person="${plan.memberId}"]`)), '탐사 중인 사람은 집 안 장면에서 빠진다');
      checks.expeditions = (checks.expeditions ?? 0) + 1;
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
        const want = s.desiredRations(window.game, t);
        const order = [];
        for (const [id, r] of Object.entries(want)) {
          for (const kind of ['food', 'water']) {
            const has = !!window.game.rations[id]?.[kind];
            if (has !== r[kind]) order.push({ id, kind, want: r[kind] });
          }
        }
        order.sort((a, b) => Number(a.want) - Number(b.want)); // 먼저 끄고 나중에 켠다
        return order[0] ?? null;
      }, target);
      if (!diff) break;
      await page.click(`input[data-action="ration"][data-person="${diff.id}"][data-kind="${diff.kind}"]`);
    }

    const beforeDay = await page.evaluate(() => ({
      day: window.game.day,
      food: window.game.stock.food,
      water: window.game.stock.water,
      f: window.game.rationCount('food'),
      w: window.game.rationCount('water'),
      returning: window.game.expedition?.returnDay === window.game.day + 1,
    }));
    await page.click('[data-action="end-day"]');
    const afterDay = await page.evaluate(() => ({ day: window.game.day, food: window.game.stock.food, water: window.game.stock.water, phase: window.game.phase }));
    if (afterDay.phase === 'home') {
      assert.equal(afterDay.day, beforeDay.day + 1);
      // 탐사자가 물자를 들고 오는 아침이 아니면, 밤사이 재고 변화는 배급한 만큼의 소비뿐이다
      if (!beforeDay.returning) {
        assert.equal(beforeDay.food - afterDay.food, beforeDay.f, '배급한 식량만큼 소비');
        assert.equal(beforeDay.water - afterDay.water, beforeDay.w, '배급한 물만큼 소비');
      }
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
    // 1) 좀비 없이 세 경로를 끝까지 (흐름·조건 검증). 탐사에서 가족을 잃어 질 수도 있어 경로마다 시드 2개까지.
    for (const [target, seeds] of [
      ['rescue', [101, 102]],
      ['group', [202, 203]],
      ['car', [303, 304]],
    ]) {
      let won = false;
      for (const seed of seeds) {
        const { ending, checks } = await playThrough(page, {
          baseUrl,
          seed,
          target,
          zombies: false,
          timescale: 4,
          shotPrefix: target === 'rescue' && seed === seeds[0] ? 'flow' : null,
        });
        log(`[좀비 없음] ${target} seed ${seed}: ${ending?.id} (${ending?.day}일차, 탐사 ${ending?.expeditions}회)`, JSON.stringify(checks));
        assert.ok(ending, '결말에 도달한다');
        results.push({ target, seed, zombies: false, ending: ending.id });
        if (target === 'rescue' && seed === seeds[0]) await page.screenshot({ path: join(OUT, 'flow-6-ending.png') });
        if (ending.id === target) {
          won = true;
          break;
        }
        assert.notEqual(ending.type, 'victory', '다른 경로로 이기지 않는다');
      }
      assert.ok(won, `${target} 경로로 승리해야 한다`);
    }

    // 2) 좀비가 있는 실제 난이도로 플레이 (승리든 패배든 결말까지 가야 한다)
    for (const [target, seed] of [
      ['rescue', 11],
      ['group', 12],
      ['rescue', 13],
    ]) {
      const { ending, checks } = await playThrough(page, { baseUrl, seed, target, zombies: true, timescale: 3, shotPrefix: seed === 11 ? 'zombie' : null });
      log(`[좀비 있음] ${target} seed ${seed}: ${ending?.id} (${ending?.type}, ${ending?.day}일차, 탐사 ${ending?.expeditions}회)`, JSON.stringify(checks));
      assert.ok(ending, '결말에 도달한다');
      results.push({ target, seed, zombies: true, ending: ending.id });
    }

    // 3) 결말 화면에서 같은 시드로 다시 시작
    await waitScreen(page, 'ending');
    await page.screenshot({ path: join(OUT, 'restart-1-ending.png') });
    const oldSeed = await page.evaluate(() => window.game.seed);
    await page.click('[data-action="same-seed"]');
    await waitScreen(page, 'run');
    const fresh = await page.evaluate(() => ({ seed: window.game.seed, phase: window.game.phase, day: window.game.day, items: window.game.inventory.items.length }));
    assert.deepEqual(fresh, { seed: oldSeed, phase: 'ready', day: 0, items: 0 });

    // 4) 60초 동안 마트에 가만히 있으면 시간 초과 패배 → 새 게임
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
