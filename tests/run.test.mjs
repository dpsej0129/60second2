import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_SPEED, RUN_SECONDS, SIM_STEP } from '../src/core/constants.js';
import { Game } from '../src/core/game.js';
import { ITEMS } from '../src/core/items.js';
import { pickupPreview, spawnZombie } from '../src/core/run.js';
import { HOME_ZONE, MART_DOORS, SHELVES, inMart } from '../src/core/world.js';
import { RunBot, standPoint } from './helpers/bot.mjs';
import { HOME_SPOT, dropAtHome, enterHome, pickHere, teleport } from './helpers/setup.mjs';
import { playScramble } from './helpers/strategy.mjs';

const shelfOf = (itemId) => SHELVES.find((s) => s.itemId === itemId);

function startGame(seed = 3, zombies = false) {
  const game = new Game({ seed, zombies });
  game.startFirstRun();
  return game;
}

function grab(game, itemId) {
  const shelf = shelfOf(itemId);
  teleport(game, standPoint(shelf, game.run.player));
  pickHere(game);
}

test('60초 탐색은 마트 안에서 시작하고, 시작 버튼을 누르기 전에는 시간이 흐르지 않는다', () => {
  const game = new Game({ seed: 3 });
  assert.equal(game.phase, 'ready');
  assert.equal(game.run, null);
  game.startFirstRun();
  assert.equal(game.phase, 'run');
  assert.equal(game.run.timeLeft, RUN_SECONDS);
  assert.ok(inMart(game.run.player), '플레이어는 마트 안에서 시작');
  assert.ok(game.run.zombies.length > 0, '좀비가 있다');
  assert.deepEqual(
    game.run.ground.map((g) => g.id),
    ['dad', 'mom', 'sis'],
    '가족 3명이 집 주변에 흩어져 있다',
  );
  game.stepRun(1, {});
  assert.ok(Math.abs(game.run.timeLeft - (RUN_SECONDS - 1)) < 1e-9);
});

test('집 밖 이동 속도가 빨라졌다: 빈손으로 마트 정문에서 집까지 8초 안쪽', () => {
  assert.ok(PLAYER_SPEED >= 150);
  const game = startGame();
  teleport(game, MART_DOORS[0].outside);
  const start = game.run.elapsed;
  const bot = new RunBot([], { avoidZombies: false }); // 차를 피해 가는 경로로 집까지 가서 들어간다
  for (let i = 0; i < 2000 && game.phase === 'run'; i++) game.stepRun(SIM_STEP, bot.next(game.run));
  const seconds = game.lastRun.elapsed - start;
  assert.equal(game.lastRun.endedBy, 'enter');
  assert.ok(seconds < 8, `${seconds.toFixed(2)}초`);
});

test('집기 전에 필요한 칸 수와 남은 칸을 알려 주고, 칸이 모자라면 집지 못한다', () => {
  const game = startGame();
  const run = game.run;
  game.inventory.add('canned');
  game.inventory.add('water');
  game.inventory.add('water'); // 3칸 사용, 1칸 남음
  const shelf = shelfOf('medkit');
  teleport(game, standPoint(shelf, run.player));
  const preview = pickupPreview(run);
  assert.equal(preview.shelf.id, shelf.id);
  assert.equal(preview.need, 2);
  assert.equal(preview.free, 1);
  assert.equal(preview.canFit, false);
  game.stepRun(SIM_STEP, { interact: true });
  assert.equal(run.pickup, null, '줍기가 시작되지 않는다');
  assert.equal(game.inventory.items.length, 3);
  assert.match(run.toasts.at(-1).text, /칸이 부족하다/);

  // 마트 안에서 하나를 내려놓으면 선반으로 돌아가고, 2칸이 비어 집을 수 있다
  game.stepRun(SIM_STEP, { drop: 2 });
  assert.equal(game.inventory.free, 2);
  assert.ok(pickupPreview(run).canFit);
  const before = game.martStock[shelf.id];
  pickHere(game);
  assert.deepEqual(game.inventory.items, ['canned', 'water', 'medkit']);
  assert.equal(game.martStock[shelf.id], before - 1, '마트 재고가 줄어든다');
});

test('집 앞에 물품을 내려놓아도 탐색은 계속되고, 60초 안에 다시 나가 더 가져올 수 있다', () => {
  const game = startGame();
  grab(game, 'radio');
  grab(game, 'battery');
  dropAtHome(game);
  assert.equal(game.phase, 'run', '집에 들어간 것이 아니라 내려놓기만 했다');
  assert.equal(game.inventory.isEmpty, true, '가방이 비었다');
  assert.deepEqual(game.run.delivered, ['radio', 'battery']);
  const t = game.run.timeLeft;
  game.stepRun(1, {});
  assert.ok(game.run.timeLeft < t, '시간은 계속 흐른다');

  grab(game, 'waterPack');
  dropAtHome(game);
  assert.deepEqual(game.run.delivered, ['radio', 'battery', 'waterPack']);
  assert.equal(game.stock.water, 0, '재고에는 탐색이 끝날 때 들어간다');
  enterHome(game);
  assert.equal(game.phase, 'home');
  assert.equal(game.stock.radio, 1);
  assert.equal(game.stock.battery, ITEMS.battery.gives.battery);
  assert.equal(game.stock.water, ITEMS.waterPack.gives.water);
});

test('가족도 칸을 차지하는 짐처럼 데려와야 하고, 데려오지 못한 가족은 남겨진다', () => {
  const game = startGame();
  const run = game.run;
  const dad = run.ground.find((g) => g.id === 'dad');
  teleport(game, dad);
  const preview = pickupPreview(run);
  assert.equal(preview.item.kind, 'person');
  assert.equal(preview.need, 3, '아빠는 3칸');
  pickHere(game);
  assert.deepEqual(game.inventory.items, ['dad']);
  assert.equal(game.inventory.free, 1);
  assert.ok(!run.ground.some((g) => g.id === 'dad'));

  // 아빠를 데리고 있으면 엄마(2칸)는 함께 데려갈 수 없다
  teleport(game, run.ground.find((g) => g.id === 'mom'));
  game.stepRun(SIM_STEP, { interact: true });
  assert.equal(run.pickup, null);
  assert.match(run.toasts.at(-1).text, /칸이 부족하다/);

  dropAtHome(game);
  assert.deepEqual(run.delivered, ['dad']);
  enterHome(game);
  assert.equal(game.person('dad').status, 'home');
  assert.equal(game.person('mom').status, 'left');
  assert.equal(game.person('sis').status, 'left');
  assert.deepEqual(
    game.presentPeople().map((p) => p.id),
    ['me', 'dad'],
  );
});

test('집 밖에서 내려놓은 가족·물품은 그 자리에 남아 다시 데려갈 수 있다', () => {
  const game = startGame();
  const run = game.run;
  teleport(game, run.ground.find((g) => g.id === 'sis'));
  pickHere(game);
  teleport(game, { x: 1300, y: 690 });
  game.stepRun(SIM_STEP, { drop: 0 });
  const waiting = run.ground.find((g) => g.id === 'sis');
  assert.ok(waiting && Math.abs(waiting.x - 1300) < 1, '동생이 내려놓은 자리에서 기다린다');
  pickHere(game);
  assert.deepEqual(game.inventory.items, ['sis']);
});

test('60초가 끝날 때 집 문간에 있으면 무사하다', () => {
  const game = startGame();
  grab(game, 'canned');
  teleport(game, HOME_SPOT);
  for (let i = 0; i < (RUN_SECONDS + 1) / SIM_STEP && game.phase === 'run'; i++) game.stepRun(SIM_STEP, {});
  assert.equal(game.phase, 'home');
  assert.equal(game.lastRun.endedBy, 'time');
  assert.equal(game.stock.food, ITEMS.canned.gives.food);
});

test('60초가 끝날 때 집 밖에 있으면 패배한다', () => {
  const game = startGame(5);
  grab(game, 'canned');
  dropAtHome(game); // 물건을 들여놓았더라도
  teleport(game, { x: 1200, y: 100 });
  for (let i = 0; i < (RUN_SECONDS + 1) / SIM_STEP && game.phase === 'run'; i++) game.stepRun(SIM_STEP, {});
  assert.equal(game.phase, 'ending');
  assert.equal(game.ending.id, 'timeout');
  assert.equal(game.ending.type, 'defeat');
});

test('좀비에게 붙잡히면 패배하지만, 집 문간에 들어서면 잡히지 않는다', () => {
  const caught = startGame(5, true);
  const p = caught.run.player;
  spawnZombie(caught.run, 'mart', { x: p.x + 40, y: p.y });
  for (let i = 0; i < 120 && caught.phase === 'run'; i++) caught.stepRun(SIM_STEP, {});
  assert.equal(caught.phase, 'ending');
  assert.equal(caught.ending.id, 'caught');

  const safe = startGame(5, true);
  teleport(safe, HOME_SPOT);
  safe.stepRun(SIM_STEP, {});
  spawnZombie(safe.run, 'street', { x: HOME_ZONE.x - 30, y: HOME_SPOT.y });
  for (let i = 0; i < 180 && safe.phase === 'run'; i++) safe.stepRun(SIM_STEP, {});
  assert.equal(safe.phase, 'run', '문간에서는 잡히지 않는다');
  assert.ok(safe.run.zombies.every((z) => z.x < HOME_ZONE.x), '좀비는 문간 안으로 들어오지 못한다');
});

test('물자 한 번 왕복과 가족 3명 구출을 60초 안에 해낼 수 있다(좀비 없음)', () => {
  const game = startGame(7);
  const result = playScramble(game, [['radio', 'battery', 'flare', 'water'], ['dad'], ['mom', 'sis']]);
  assert.equal(result.outcome, 'home');
  assert.deepEqual(result.family.sort(), ['dad', 'mom', 'sis']);
  assert.equal(result.items.length, 4);
  assert.ok(result.elapsed > 20, `${result.elapsed.toFixed(1)}초`);
  assert.equal(game.presentPeople().length, 4);
});

test('가족을 포기하면 그 시간에 마트를 한 번 더 다녀올 수 있다(좀비 없음)', () => {
  const game = startGame(7);
  const result = playScramble(game, [['waterPack', 'ration'], ['waterPack', 'ration']]);
  assert.equal(result.outcome, 'home');
  assert.equal(result.items.length, 4);
  assert.equal(result.family.length, 0);
  assert.equal(game.stock.water, 2 * ITEMS.waterPack.gives.water);
});

test('방향키 하나로 선반 모서리를 스치며 지나가도 걸리지 않는다', () => {
  const game = startGame();
  const p = game.run.player;
  // 2번째 선반 열 위쪽 모서리(280, 122)를 아래쪽으로 살짝 스치는 높이
  p.x = 260;
  p.y = 109;
  for (let i = 0; i < 30; i++) game.stepRun(SIM_STEP, { mx: 1, my: 0 });
  assert.ok(p.x > 300, `오른쪽으로 계속 나아간다 (x=${p.x.toFixed(1)})`);
});
