// 다른 곳으로 이사하기: 제한 시간 안에 짐과 식구를 새 은신처(지하 방공호)로 옮긴다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIM_STEP } from '../src/core/constants.js';
import { Game } from '../src/core/game.js';
import { SERVINGS } from '../src/core/items.js';
import { MOVE_SECONDS, collides, inRect } from '../src/core/world.js';
import { renderShelter } from '../src/ui/shelter.js';
import { standPoint } from './helpers/bot.mjs';
import { homeGame, pickHere, stageEvent, teleport } from './helpers/setup.mjs';
import { moveLegs, playGame, playMove } from './helpers/strategy.mjs';

function startMove(seed = 91, stock = { food: 9, water: 6, med: 2, radio: 1, fuel: 1 }, bring) {
  const game = homeGame({ seed, stock, ...(bring ? { bring } : {}) });
  stageEvent(game, 'bunker_found');
  game.chooseOption('move');
  return game;
}

test('방공호를 찾으면 이사를 고를 수 있고, 고르면 짐을 쌓아 둔 옛집 지도에서 카운트다운을 기다린다', () => {
  const game = startMove();
  assert.equal(game.phase, 'ready');
  const move = game.upcomingRun();
  assert.equal(move.kind, 'move');
  assert.equal(move.duration, MOVE_SECONDS);
  assert.equal(move.map.labels.home, '방공호');
  // 집 재고가 그대로 이삿짐이 된다(통조림·생수는 한 캔·한 병씩)
  const pile = (itemId) => move.martStock[`pile-${itemId}`];
  assert.equal(pile('canned'), 3, '통조림 9끼 = 3캔(마지막 캔은 ¼만 남음)');
  assert.equal(pile('water'), 2);
  assert.equal(pile('bandage'), 2);
  assert.equal(pile('radio'), 1);
  assert.equal(pile('fuel'), 1);
  assert.deepEqual(move.familyIds.sort(), ['dad', 'mom', 'sis']);
  for (const s of move.map.shelves) assert.ok(inRect(s, move.map.indoor), '짐은 옛집 안에 있다');
  assert.ok(!collides(move.map.start.x, move.map.start.y, 14, move.map.solids));
  assert.equal(game.canEndDay(), '지금은 하루를 마칠 수 없다');
  assert.ok(game.startRun());
  assert.equal(game.phase, 'run');
  assert.equal(game.run.kind, 'move');
  assert.equal(game.run.timeLeft, MOVE_SECONDS);
});

test('옮긴 것만 남는다: 못 옮긴 짐은 잃고, 데려오지 못한 식구는 옛집에 남는다', () => {
  const game = startMove();
  game.startRun();
  const { map } = game.run;
  // 통조림 1캔과 무전기만 들고, 아빠만 데리고 방공호로
  for (const itemId of ['canned', 'radio']) {
    const shelf = map.shelves.find((s) => s.itemId === itemId);
    teleport(game, standPoint(shelf, game.run.player));
    pickHere(game);
  }
  const home = { x: map.homeZone.x + map.homeZone.w / 2, y: map.homeZone.y + map.homeZone.h / 2 };
  teleport(game, home);
  game.stepRun(SIM_STEP, {});
  teleport(game, game.run.ground.find((g) => g.id === 'dad'));
  pickHere(game);
  teleport(game, home);
  game.stepRun(SIM_STEP, {});
  game.stepRun(SIM_STEP, { interact: true });
  assert.equal(game.phase, 'home', '이사를 마치면 같은 날 집 화면으로 돌아온다');
  assert.equal(game.flags.shelter, 'bunker');
  assert.equal(game.stock.food, SERVINGS, '통조림 1캔');
  assert.equal(game.stock.water, 0, '물은 두고 왔다');
  assert.equal(game.stock.radio, 1);
  assert.equal(game.stock.med, 0);
  assert.equal(game.person('dad').status, 'home');
  for (const id of ['mom', 'sis']) {
    assert.equal(game.person(id).status, 'left');
    assert.match(game.person(id).fate, /이사하던 날/);
  }
  assert.ok(game.log.some((e) => /옛집에 두고 온 것: .*물 1½병/.test(e.text)), '두고 온 것이 일지에 적힌다');
  assert.match(renderShelter(game), /data-place="bunker"/, '집 안 장면이 방공호로 바뀐다');
  assert.equal(game.canEndDay(), null);
});

test('부분만 남은 캔: 옮긴 캔 수만큼, 원래 있던 끼니를 넘지 않게 돌아온다', () => {
  const game = startMove(92, { food: 9, water: 0 }, []);
  const legs = moveLegs(game);
  assert.deepEqual(legs, [['canned', 'canned', 'canned']]);
  playMove(game);
  assert.equal(game.phase, 'home');
  assert.equal(game.stock.food, 9, '세 캔 모두 옮기면 9끼 그대로');
});

test('이사하다 시간이 다 되거나 붙잡히면 끝난다', () => {
  const game = startMove(93);
  game.startRun();
  for (let i = 0; i < (MOVE_SECONDS + 1) / SIM_STEP && game.phase === 'run'; i++) game.stepRun(SIM_STEP, {});
  assert.equal(game.ending.id, 'timeout');
  assert.match(game.ending.text, /이삿짐을 나르다 시간이 다 됐다/);
});

test('방공호에서는 불이 나지 않고, 약탈자가 찾아오지 않고, 좀비 떼도 철문이 막아 주고, 물탱크에서 물이 고인다', () => {
  const game = startMove(94);
  playMove(game);
  assert.equal(game.flags.shelter, 'bunker');
  const def = (id) => game.director.randomEvents.find((e) => e.id === id);
  game.day = 40;
  assert.equal(def('fire').when(game), false);
  game.flags.gangAnger = 0;
  assert.equal(def('gang_note').when(game), false);
  assert.equal(def('bunker_found').when(game), false, '이미 옮겼으면 다시 나오지 않는다');
  stageEvent(game, 'horde_warning');
  game.chooseOption('pray');
  stageEvent(game, 'horde');
  game.chooseOption('hold');
  assert.equal(game.ending, null, '철문이 버틴다');
  game.nightEvents = true;
  game.director.randomEvents = [];
  game.director.pick = () => null;
  let tank = 0;
  for (let d = 0; d < 30 && game.phase === 'home'; d++) {
    game.setAllRations(true);
    game.stock.food = 40;
    game.stock.water = 40;
    game.endDay();
    if (game.nightHistory.tank === game.day - 1) tank += 1;
  }
  assert.ok(tank >= 2, `물탱크 ${tank}번`);
});

test('실제 플레이: 봇이 방공호로 이사하고 계속 버틴다', () => {
  let moved = 0;
  let survivedMove = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const game = playGame(new Game({ seed, zombies: false, difficulty: 'easy' }), { target: 'rescue', maxDays: 60 });
    if (game.moves) {
      moved += 1;
      if (game.ending?.id !== 'timeout' && game.ending?.id !== 'caught') survivedMove += 1;
    }
  }
  assert.ok(moved >= 5, `20판 중 ${moved}판 이사`);
  assert.equal(survivedMove, moved, '좀비가 없으면 이사는 늘 무사히 끝난다');
});
