import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPEDITION_CAPACITY, EXPEDITION_DAYS } from '../src/core/constants.js';
import { expeditionRisk, rollLoot } from '../src/core/expedition.js';
import { Game } from '../src/core/game.js';
import { ITEMS } from '../src/core/items.js';
import { Rng } from '../src/core/rng.js';
import { initialMartStock, martSummary } from '../src/core/world.js';
import { homeGame, passDays, resolveAnyEvent } from './helpers/setup.mjs';

/** 탐사자가 돌아올 때까지(또는 결말까지) 하루씩 넘긴다. */
function untilReturn(game) {
  for (let i = 0; i < 10 && game.expedition && game.phase === 'home'; i++) {
    resolveAnyEvent(game);
    if (game.phase !== 'home') break;
    game.endDay();
  }
}

test('탐사를 보내면 그 사람은 집을 떠나 먹지 않고, 한 번에 한 명만 보낼 수 있다', () => {
  const game = homeGame({ seed: 41, stock: { food: 30, water: 30 } });
  resolveAnyEvent(game);
  assert.equal(game.expeditionReason('dad'), null);
  assert.ok(game.sendExpedition({ memberId: 'dad', targetId: 'supplies' }));
  assert.equal(game.person('dad').status, 'away');
  assert.ok(!game.presentPeople().some((p) => p.id === 'dad'));
  assert.equal(game.dailyNeed().people, 3, '하루 필요량에서 빠진다');
  assert.match(game.expeditionReason('mom'), /아직 끝나지 않았다/);
  assert.equal(game.sendExpedition({ memberId: 'mom' }), false);
  const before = game.stock.food;
  game.endDay();
  if (game.expedition) assert.equal(before - game.stock.food, 3, '탐사자 몫은 소비하지 않는다');
});

test(`탐사자는 ${EXPEDITION_DAYS[0]}~${EXPEDITION_DAYS[1]}일 뒤 아침에 마트 물자를 들고 돌아온다`, () => {
  const durations = new Set();
  let returned = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const game = homeGame({ seed, stock: { food: 50, water: 50 } });
    resolveAnyEvent(game);
    const martBefore = martSummary(game.martStock);
    const stockBefore = { ...game.stock };
    const depart = game.day;
    game.sendExpedition({ memberId: 'dad', targetId: 'fuel' });
    untilReturn(game);
    const report = game.expeditionReport;
    assert.ok(report, `seed ${seed}: 결과가 있다`);
    const days = report.day - depart;
    durations.add(days);
    assert.ok(days >= EXPEDITION_DAYS[0] && days <= EXPEDITION_DAYS[1], `${days}일`);
    if (report.outcome === 'lost') {
      assert.equal(game.person('dad').status, 'lost');
      continue;
    }
    returned += 1;
    assert.equal(game.person('dad').status, 'home');
    assert.ok(report.items.includes('fuel'), '찾으라고 한 연료통은 남아 있으면 반드시 가져온다');
    const slots = report.items.reduce((sum, id) => sum + ITEMS[id].slots, 0);
    assert.ok(slots <= EXPEDITION_CAPACITY, `최대 ${EXPEDITION_CAPACITY}칸`);
    const martAfter = martSummary(game.martStock);
    for (const id of report.items) assert.ok(martAfter[id] < martBefore[id], `마트의 ${id} 재고가 줄었다`);
    assert.ok(game.stock.fuel > stockBefore.fuel, '집 재고에 들어왔다');
  }
  assert.ok(returned > 30, `40번 중 ${returned}번 무사히 돌아옴`);
  assert.ok(durations.size >= 2, '돌아오는 날이 매번 다르다');
});

test('탐사를 거듭할수록 위험해지고, 아빠나 방망이가 있으면 덜 위험하다', () => {
  const mom = { trait: 'medic', health: 0, hunger: 0, thirst: 0 };
  const dad = { trait: 'guard', health: 0, hunger: 0, thirst: 0 };
  const hurt = { ...mom, health: 1 };
  assert.ok(expeditionRisk(mom, { count: 5 }).lost > expeditionRisk(mom, { count: 0 }).lost);
  assert.ok(expeditionRisk(mom, { count: 5 }).injury > expeditionRisk(mom, { count: 0 }).injury);
  assert.ok(expeditionRisk(dad).lost < expeditionRisk(mom).lost);
  assert.ok(expeditionRisk(mom, { withWeapon: true }).lost < expeditionRisk(mom).lost);
  assert.ok(expeditionRisk(hurt).lost > expeditionRisk(mom).lost, '다친 사람은 더 위험하다');
});

test('마트가 비면 탐사해도 가져올 것이 없다(길에서 주운 것만)', () => {
  const empty = Object.fromEntries(Object.keys(initialMartStock()).map((k) => [k, 0]));
  const loot = rollLoot({ martStock: empty, targetId: 'supplies', rng: new Rng(5) });
  assert.deepEqual(loot.items, []);
  assert.equal(loot.foundTarget, false);
  assert.ok(loot.extra.food + loot.extra.water <= 2);
});

test('탐사 중인 가족은 사건에서 도울 수 없다', () => {
  const game = homeGame({ seed: 42, stock: { food: 30, water: 30 } });
  resolveAnyEvent(game);
  game.sendExpedition({ memberId: 'dad' });
  game.event = { defId: 'raid', chainId: null, day: game.day, params: {}, resolved: false, outcome: null, choice: null };
  const dadOption = game.eventView().options.find((o) => o.id === 'dad');
  assert.equal(dadOption.disabled, true);
  assert.match(dadOption.reason, /집에 없다/);
});

test('집을 비워 둘 수는 없고, 움직일 수 없는 사람은 보낼 수 없다', () => {
  const alone = homeGame({ seed: 43, bring: [] });
  resolveAnyEvent(alone);
  assert.match(alone.expeditionReason('me'), /집을 비워/);
  const game = homeGame({ seed: 43, bring: ['mom'] });
  resolveAnyEvent(game);
  game.person('mom').health = 2;
  assert.match(game.expeditionReason('mom'), /중상/);
  assert.equal(game.expeditionReason('me'), null, '주인공도 갈 수 있다');
});

test('주인공이 탐사에서 돌아오지 못하면 패배한다', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const game = homeGame({ seed, bring: ['mom'], stock: { food: 50, water: 50 } });
    resolveAnyEvent(game);
    game.expeditions = 30; // 위험을 최대로
    game.sendExpedition({ memberId: 'me' });
    untilReturn(game);
    if (game.expeditionReport?.outcome !== 'lost') continue;
    assert.equal(game.phase, 'ending');
    assert.equal(game.ending.id, 'lost');
    assert.equal(game.ending.type, 'defeat');
    return;
  }
  assert.fail('돌아오지 못한 경우를 찾지 못했다');
});

test('탈출하는 날 탐사를 나가 있던 가족은 함께 가지 못한다', () => {
  const game = homeGame({ seed: 44, stock: { food: 50, water: 50, flare: 1 } });
  passDays(game, 1);
  resolveAnyEvent(game);
  game.sendExpedition({ memberId: 'mom' });
  const chain = game.director.chains.rescue;
  chain.stage = 2;
  chain.opened = true;
  for (const other of Object.values(game.director.chains)) if (other !== chain) other.due = game.day + 30;
  game.director.schedule(chain, game.day + 1);
  game.expedition.returnDay = game.day + 5; // 헬기보다 늦게 돌아온다
  assert.match(game.pathsView().find((p) => p.id === 'rescue').next, /엄마가 그날까지 돌아오지 못하면/);
  game.endDay();
  assert.equal(game.event.defId, 'rescue_arrival');
  game.chooseOption('flare');
  assert.equal(game.ending.id, 'rescue');
  assert.ok(game.ending.lost.includes('엄마'));
  assert.match(game.ending.text, /탐사를 나간 엄마/);
});

test('새 게임은 탐사 기록 없이 시작한다', () => {
  const game = new Game({ seed: 1 });
  assert.equal(game.expeditions, 0);
  assert.equal(game.expedition, null);
});
