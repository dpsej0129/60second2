// 실제 브라우저에서 화면을 눌러 가며 끝까지 플레이하는 검증 스크립트.
//   npm run test:e2e
// Playwright(Chromium)가 설치되어 있어야 한다. 없으면 건너뛴다.
//
// 시작 화면에서 난이도를 고르고, 60초 탐색은 키보드 이벤트로, 집 화면은 버튼·라디오·체크박스 클릭으로만 조작한다.
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
      const bot = new RunBot(scramblePlan(scrambleLegs(target, bring), game.run.martStock, game.run.map), { arriveDistance: 10 });
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
async function playThrough(page, { baseUrl, seed, target, zombies, timescale, shotPrefix, difficulty = 'easy', bring = ['dad', 'mom', 'sis'] }) {
  const checks = {};
  const shot = async (name, fullPage = false) => {
    if (shotPrefix) await page.screenshot({ path: join(OUT, `${shotPrefix}-${name}.png`), fullPage });
  };
  await page.goto(`${baseUrl}/?seed=${seed}&debug=1&timescale=${timescale}${zombies ? '' : '&zombies=off'}`);
  await waitScreen(page, 'title');
  assert.equal(await page.$$eval('input[name="difficulty"]', (els) => els.length), 3, '난이도 세 가지');
  await page.click(`label.level.${difficulty}`); // 시작 전에 난이도를 고른다
  if (shotPrefix) await shot('0-title');
  await page.click('button[type=submit]');
  await waitScreen(page, 'run');
  assert.equal(await page.evaluate(() => window.game.difficulty.id), difficulty, '고른 난이도로 시작한다');
  assert.equal(await text(page, '[data-ref="time"]'), '80.0', '시작 전에는 80초 그대로');
  await page.waitForTimeout(400);
  assert.equal(await text(page, '[data-ref="time"]'), '80.0', '카운트다운 시작 전에는 시간이 흐르지 않는다');
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
  assert.match(need, /한 끼 = 통조림 ¼캔 · 물 ¼병/, '한 끼는 ¼캔·¼병');
  // 통조림 1캔·생수 1병은 4번 나눠 먹는다
  const counted = await page.evaluate(() => ({ food: window.game.stock.food, water: window.game.stock.water }));
  assert.equal(counted.food, 4 * scramble.items.filter((id) => id === 'canned').length, '통조림 1캔 = 4끼');
  assert.equal(counted.water, 4 * scramble.items.filter((id) => id === 'water').length, '생수 1병 = 4번');
  // 일지 첫 쪽: 60초 동안 있었던 일
  assert.equal(await text(page, '[data-ref="diary"] .page-day'), '1일차');
  checks.firstPage = await text(page, '[data-ref="diary"] [data-part="recap"]');
  assert.match(checks.firstPage, /60초/);
  const homeHtml = await page.content();
  assert.ok(!homeHtml.includes('마트에 남은 물자'), '마트 남은 물자는 보이지 않는다');
  assert.ok(!/실종 \d+%|부상 \d+%/.test(homeHtml), '탐사 확률은 보이지 않는다');

  let homeShot = false;
  let reportShot = false;
  let turnedPage = false;
  for (let guard = 0; guard < 130; guard++) {
    screen = await waitScreen(page, 'home', 'ending');
    if (screen === 'ending') break;
    const html = await page.content();
    assert.ok(!/탈출 경로|탈출 계획|data-ref="paths"|data-ref="missions"/.test(html), '탈출 조건·미션 진행은 화면에 없다');

    // 탐사에서 돌아온 소식은 일지의 아침 부분에 적힌다
    if (await page.$('[data-ref="diary"] .entry.morning')) {
      checks.reports = (checks.reports ?? 0) + 1;
      if (!reportShot) {
        await shot('5-expedition-report', true);
        reportShot = true;
        checks.firstReport = await text(page, '[data-ref="diary"] .entry.morning');
      }
    }

    // 지난 쪽 넘겨 보기
    const day = await page.evaluate(() => window.game.day);
    if (!turnedPage && day >= 4) {
      await page.click('[data-ref="diary"] [aria-label="이전 쪽"]');
      assert.equal(await text(page, '[data-ref="diary"] .page-day'), `${day - 1}일차`, '한 쪽 앞으로 넘어간다');
      await shot('4-journal-past-page');
      await page.click('[data-ref="diary"] .back-today');
      assert.equal(await text(page, '[data-ref="diary"] .page-day'), `${day}일차`, '오늘 쪽으로 돌아온다');
      turnedPage = true;
    }

    // 오늘의 사건(덤으로 이어지는 미션 사건까지 모두)
    let ended = false;
    for (let i = 0; i < 4 && (await page.$('[data-ref="event"].pending')); i++) {
      if (!homeShot) {
        await shot('3-home-event', true);
        homeShot = true;
      }
      if (await page.$('.event-card.earlier')) checks.followUps = (checks.followUps ?? 0) + 1;
      const option = await strategy(page, 'chooseOption', target);
      await page.click(`[data-action="choose"][data-option="${option}"]`);
      if (await page.evaluate(() => window.game.phase === 'ending')) {
        ended = true;
        break;
      }
    }
    if (ended) break;

    // 마음이 가라앉은 식구와 이야기 나누기(버튼)
    const talk = await strategy(page, 'talkTarget');
    if (talk && (await page.$(`[data-action="talk"][data-person="${talk}"]:not([disabled])`))) {
      await page.click(`[data-action="talk"][data-person="${talk}"]`);
      checks.talks = (checks.talks ?? 0) + 1;
      if (checks.talks === 1) await shot('6-talk', true);
    }

    // 탐사(라디오·체크박스·버튼). 무엇을 가져올지는 고를 수 없다.
    const plan = await strategy(page, 'expeditionPlan');
    if (plan) {
      assert.equal(await page.$('[data-ref="expedition"] select'), null, '찾아올 것을 고르는 칸이 없다');
      await page.click(`input[data-draft="memberId"][value="${plan.memberId}"]`);
      const weapon = await page.$('input[data-draft="withWeapon"]');
      // 체크 상자는 그림 단추(label) 안에 숨겨져 있어 label을 누른다
      if (weapon && plan.withWeapon !== (await weapon.isChecked())) await page.click('label:has(> input[data-draft="withWeapon"])');
      await page.click('[data-action="send-expedition"]');
      const exp = await page.evaluate(() => window.game.expedition);
      assert.equal(exp.memberId, plan.memberId, '고른 사람이 탐사를 떠났다');
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
      await page.click(`label:has(> input[data-action="ration"][data-person="${diff.id}"][data-kind="${diff.kind}"])`);
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
  // 손글씨 글꼴(Google Fonts)을 못 받는 환경이면 기본 글꼴로 대신한다(오류로 치지 않는다)
  page.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location()?.url ?? '') && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const results = [];

  try {
    // 1) 좀비 없이 여섯 경로를 끝까지 (흐름·조건 검증). 탐사에서 가족을 잃어 질 수도 있어 경로마다 시드 2개까지.
    for (const [target, seeds] of [
      ['rescue', [101, 102]],
      ['group', [202, 203]],
      ['car', [303, 304]],
      ['safezone', [404, 405]],
      ['caravan', [505, 506]],
      ['train', [606, 607]],
    ]) {
      let won = false;
      for (const seed of seeds) {
        const first = target === 'rescue' && seed === seeds[0];
        const { ending, checks } = await playThrough(page, { baseUrl, seed, target, zombies: false, timescale: 4, difficulty: 'easy', shotPrefix: first ? 'flow' : null });
        log(`[좀비 없음·이지] ${target} seed ${seed}: ${ending?.id} (${ending?.day}일차, 탐사 ${ending?.expeditions}회)`, JSON.stringify(checks));
        assert.ok(ending, '결말에 도달한다');
        assert.equal(ending.difficulty, '이지');
        results.push({ target, seed, difficulty: 'easy', zombies: false, ending: ending.id });
        if (first) {
          await page.screenshot({ path: join(OUT, 'flow-7-ending.png'), fullPage: true });
          assert.ok(await page.$('[data-ref="new-ending"]'), '처음 본 결말은 새 결말로 표시된다');
          assert.ok(await page.$('[data-ref="epilogue"] li'), '식구마다 후일담이 나온다');
        }
        if (ending.id === target) {
          won = true;
          break;
        }
        assert.notEqual(ending.type, 'victory', '다른 경로로 이기지 않는다');
      }
      assert.ok(won, `${target} 경로로 승리해야 한다`);
    }

    // 2) 좀비가 있는 실제 난이도로 플레이 (승리든 패배든 결말까지 가야 한다)
    for (const [target, seed, difficulty] of [
      ['rescue', 11, 'easy'],
      ['group', 12, 'hard'],
      ['rescue', 13, 'apocalypse'],
    ]) {
      const { ending, checks } = await playThrough(page, { baseUrl, seed, target, zombies: true, timescale: 3, difficulty, shotPrefix: seed === 11 ? 'zombie' : null });
      log(`[좀비 있음·${ending?.difficulty}] ${target} seed ${seed}: ${ending?.id} (${ending?.type}, ${ending?.day}일차, 탐사 ${ending?.expeditions}회)`, JSON.stringify(checks));
      assert.ok(ending, '결말에 도달한다');
      results.push({ target, seed, difficulty, zombies: true, ending: ending.id });
    }

    // 3) 결말 화면에서 같은 시드·같은 난이도로 다시 시작
    await waitScreen(page, 'ending');
    await page.screenshot({ path: join(OUT, 'restart-1-ending.png') });
    const old = await page.evaluate(() => ({ seed: window.game.seed, difficulty: window.game.difficulty.id }));
    await page.click('[data-action="same-seed"]');
    await waitScreen(page, 'run');
    const fresh = await page.evaluate(() => ({
      seed: window.game.seed,
      difficulty: window.game.difficulty.id,
      phase: window.game.phase,
      day: window.game.day,
      items: window.game.inventory.items.length,
    }));
    assert.deepEqual(fresh, { ...old, phase: 'ready', day: 0, items: 0 });

    // 4) 60초 동안 마트에 가만히 있으면 시간 초과 패배 → '새 게임'은 난이도를 고르는 시작 화면으로
    await page.goto(`${baseUrl}/?seed=5&debug=1&timescale=6&zombies=off`);
    await page.click('button[type=submit]');
    await waitScreen(page, 'run');
    await page.keyboard.press('Enter');
    await waitScreen(page, 'ending');
    const timeout = await page.evaluate(() => window.game.ending);
    assert.equal(timeout.id, 'timeout');
    log(`[시간 초과] ${timeout.title}: ${timeout.text}`);
    await page.click('[data-action="new-game"]');
    await waitScreen(page, 'title');
    assert.equal(await page.$$eval('input[name="difficulty"]', (els) => els.length), 3);
    // 결말 도감: 이번 검증에서 본 결말이 모두 기록되어 있다
    const seen = new Set([...results.map((r) => r.ending), 'timeout']);
    const codex = await page.$$eval('[data-ref="codex"] .codex-cell.seen', (els) => els.map((el) => el.dataset.ending));
    assert.deepEqual(new Set(codex), seen, '본 결말이 도감에 남는다');
    log(`[결말 도감] ${codex.length}/16: ${codex.join(', ')}`);
    await page.screenshot({ path: join(OUT, 'title-codex.png'), fullPage: true });

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
