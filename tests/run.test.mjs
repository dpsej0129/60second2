import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RUN_SECONDS, SIM_STEP } from '../src/core/constants.js';
import { Game } from '../src/core/game.js';
import { pickupPreview, spawnZombie } from '../src/core/run.js';
import { HOME_DOOR, SHELVES, dist, inMart } from '../src/core/world.js';
import { shelvesFor, standPoint } from './helpers/bot.mjs';
import { homeGame } from './helpers/setup.mjs';
import { playRun } from './helpers/strategy.mjs';

const shelfOf = (itemId) => SHELVES.find((s) => s.itemId === itemId);

function walkTo(game, point, maxSteps = 2000) {
  for (let i = 0; i < maxSteps && game.phase === 'run'; i++) {
    if (dist(game.run.player, point) < 3) return;
    const p = game.run.player;
    const dx = point.x - p.x;
    const dy = point.y - p.y;
    const d = Math.hypot(dx, dy);
    game.stepRun(SIM_STEP, { mx: dx / d, my: dy / d });
  }
}

test('첫 보급은 마트 안에서 60초로 시작하고, 시작 버튼을 누르기 전에는 시간이 흐르지 않는다', () => {
  const game = new Game({ seed: 3 });
  assert.equal(game.phase, 'ready');
  assert.equal(game.run, null);
  game.startFirstRun();
  assert.equal(game.phase, 'run');
  assert.equal(game.run.timeLeft, RUN_SECONDS);
  assert.ok(inMart(game.run.player), '플레이어는 마트 안에서 시작');
  assert.ok(game.run.zombies.length > 0, '좀비가 있다');
  game.stepRun(1, {});
  assert.ok(Math.abs(game.run.timeLeft - (RUN_SECONDS - 1)) < 1e-9);
});

test('집기 전에 필요한 칸 수와 남은 칸을 알려 주고, 칸이 모자라면 집지 못한다', () => {
  const game = new Game({ seed: 3, zombies: false });
  game.startFirstRun();
  const run = game.run;
  game.inventory.add('canned');
  game.inventory.add('water');
  game.inventory.add('water'); // 3칸 사용, 1칸 남음
  const shelf = shelfOf('medkit');
  const spot = standPoint(shelf, run.player);
  run.player.x = spot.x;
  run.player.y = spot.y;
  const preview = pickupPreview(run);
  assert.equal(preview.shelf.id, shelf.id);
  assert.equal(preview.need, 2);
  assert.equal(preview.free, 1);
  assert.equal(preview.canFit, false);
  game.stepRun(SIM_STEP, { interact: true });
  assert.equal(run.pickup, null, '줍기가 시작되지 않는다');
  assert.equal(game.inventory.items.length, 3);
  assert.match(run.toasts.at(-1).text, /칸이 부족하다/);

  // 하나를 선반에 되돌리면(마트 안) 2칸이 비어 집을 수 있다
  game.stepRun(SIM_STEP, { drop: 2 });
  assert.equal(game.inventory.free, 2);
  assert.ok(pickupPreview(run).canFit);
  game.stepRun(SIM_STEP, { interact: true });
  assert.ok(run.pickup, '줍기 시작');
  const before = game.martStock[shelf.id];
  for (let i = 0; i < 120 && run.pickup; i++) game.stepRun(SIM_STEP, {});
  assert.deepEqual(game.inventory.items, ['canned', 'water', 'medkit']);
  assert.equal(game.martStock[shelf.id], before - 1, '마트 재고가 줄어든다');
});

test('제한 시간 안에 집에 돌아오면 가져온 물품을 들고 가족 선택으로 넘어간다', () => {
  const game = new Game({ seed: 5, zombies: false });
  game.startFirstRun();
  const result = playRun(game, ['radio', 'battery', 'canned']);
  assert.equal(result.outcome, 'home');
  assert.ok(result.timeLeft > 0);
  assert.ok(result.elapsed > 15, '물자를 고르고 달리는 시간이 모두 60초 안에 들어간다');
  assert.deepEqual(game.inventory.items, ['radio', 'battery', 'canned']);
  assert.equal(game.phase, 'family');
});

test('제한 시간 안에 집에 돌아오지 못하면 패배한다', () => {
  const game = new Game({ seed: 5, zombies: false });
  game.startFirstRun();
  for (let i = 0; i < (RUN_SECONDS + 1) / SIM_STEP && game.phase === 'run'; i++) game.stepRun(SIM_STEP, {});
  assert.equal(game.phase, 'ending');
  assert.equal(game.ending.id, 'timeout');
  assert.equal(game.ending.type, 'defeat');
});

test('좀비에게 붙잡히면 패배한다', () => {
  const game = new Game({ seed: 5 });
  game.startFirstRun();
  const p = game.run.player;
  spawnZombie(game.run, 'mart', { x: p.x + 40, y: p.y });
  for (let i = 0; i < 120 && game.phase === 'run'; i++) game.stepRun(SIM_STEP, {});
  assert.equal(game.phase, 'ending');
  assert.equal(game.ending.id, 'caught');
});

test('추가 보급은 집 문 앞에서 시작하고, 집을 나서는 순간부터 왕복 시간이 모두 60초에 포함된다', () => {
  const game = homeGame({ seed: 9 });
  assert.equal(game.canStartSupplyRun(), game.event && !game.event.resolved ? '먼저 오늘의 사건에 대응하자' : null);
  game.startSupplyRun();
  const run = game.run;
  assert.equal(run.mode, 'supply');
  assert.equal(run.timeLeft, RUN_SECONDS, '집을 나서는 순간 60초가 시작된다');
  assert.ok(dist(run.player, HOME_DOOR) < 100, '집 문 앞에서 출발');
  assert.equal(inMart(run.player), false);

  // 마트 입구까지 가는 동안에도 시간이 흐른다
  walkTo(game, { x: 720, y: 300 });
  assert.ok(run.elapsed > 9, `마트까지 이동만으로 ${run.elapsed.toFixed(1)}초가 지났다`);
  assert.ok(run.timeLeft < RUN_SECONDS - 9);
  assert.equal(game.phase, 'run');
});

test('추가 보급: 마트에 들렀다가 제한 시간 안에 돌아오면 성공, 하루에 한 번만 나갈 수 있다', () => {
  const game = homeGame({ seed: 9 });
  if (game.event && !game.event.resolved) game.chooseOption(game.eventView().options.find((o) => !o.disabled).id);
  game.startSupplyRun();
  const result = playRun(game, ['flare', 'water']);
  assert.equal(result.outcome, 'home');
  assert.ok(result.elapsed > 25, `왕복 + 물건 고르기 = ${result.elapsed.toFixed(1)}초`);
  assert.equal(game.phase, 'home');
  assert.deepEqual(game.inventory.items, ['flare', 'water']);
  assert.match(game.canStartSupplyRun(), /이미 보급/);
  assert.equal(game.startSupplyRun(), false);
  game.endDay();
  assert.equal(game.canStartSupplyRun(), game.event && !game.event.resolved ? '먼저 오늘의 사건에 대응하자' : null);
});

test('마트 물자는 보급할 때마다 줄어들고 다시 채워지지 않는다', () => {
  const game = homeGame({ seed: 11 });
  const radioShelf = shelfOf('radio');
  assert.equal(game.martSummary().radio, 1);
  if (game.event && !game.event.resolved) game.chooseOption(game.eventView().options.find((o) => !o.disabled).id);
  game.startSupplyRun();
  playRun(game, ['radio']);
  assert.equal(game.martStock[radioShelf.id], 0);
  game.depositAll();
  game.endDay();
  if (game.event && !game.event.resolved) game.chooseOption(game.eventView().options.find((o) => !o.disabled).id);
  game.startSupplyRun();
  assert.deepEqual(shelvesFor(['radio'], game.martStock), [], '무전기는 더 이상 없다');
});

test('보급을 나갈수록 좀비가 많아진다', () => {
  const counts = [];
  for (const supplyRuns of [0, 3, 7]) {
    const game = homeGame({ seed: 4, zombies: true });
    game.supplyRuns = supplyRuns;
    if (game.event && !game.event.resolved) game.chooseOption(game.eventView().options.find((o) => !o.disabled).id);
    game.startSupplyRun();
    counts.push(game.run.zombies.length);
  }
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2], `좀비 수 ${counts.join(' < ')}`);
});

test('방향키 하나로 선반 모서리를 스치며 지나가도 걸리지 않는다', () => {
  const game = new Game({ seed: 3, zombies: false });
  game.startFirstRun();
  const p = game.run.player;
  // 2번째 선반 열 위쪽 모서리(280, 122)를 아래쪽으로 살짝 스치는 높이
  p.x = 260;
  p.y = 109;
  for (let i = 0; i < 30; i++) game.stepRun(SIM_STEP, { mx: 1, my: 0 });
  assert.ok(p.x > 300, `오른쪽으로 계속 나아간다 (x=${p.x.toFixed(1)})`);
});
