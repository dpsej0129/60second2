import assert from 'node:assert/strict';
import { renderHome } from '../src/ui/screens.js';
import { test } from 'node:test';
import { EXPEDITION_DAYS } from '../src/core/constants.js';
import { LOOT_WEIGHTS, expeditionRisk, rollItems, rollLoot } from '../src/core/expedition.js';
import { Game } from '../src/core/game.js';
import { ITEMS } from '../src/core/items.js';
import { Rng } from '../src/core/rng.js';
import { initialMartStock } from '../src/core/world.js';
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
  assert.ok(game.sendExpedition({ memberId: 'dad' }));
  assert.equal(game.person('dad').status, 'away');
  assert.ok(!game.presentPeople().some((p) => p.id === 'dad'));
  assert.equal(game.dailyNeed().people, 3, '한 끼 필요량에서 빠진다');
  assert.match(game.expeditionReason('mom'), /아직 끝나지 않았다/);
  assert.equal(game.sendExpedition({ memberId: 'mom' }), false);
  game.setAllRations(true);
  assert.equal(game.rationCount('food'), 3, '탐사자 몫은 배급하지 않는다');
});

test(`탐사자는 ${EXPEDITION_DAYS[0]}~${EXPEDITION_DAYS[1]}일 뒤 아침에 돌아오고, 가져온 물품이 그대로 재고에 들어온다`, () => {
  const durations = new Set();
  let returned = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const game = homeGame({ seed, stock: { food: 50, water: 50 } });
    game.director.pick = () => null; // 사건 없이 탐사만 본다
    const depart = game.day;
    game.sendExpedition({ memberId: 'dad' });
    let before = { ...game.stock };
    let used = { food: 0, water: 0 };
    while (game.expedition && game.phase === 'home') {
      before = { ...game.stock };
      used = { food: game.rationCount('food'), water: game.rationCount('water') };
      game.endDay();
    }
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
    const slots = report.items.reduce((sum, id) => sum + ITEMS[id].slots, 0);
    assert.ok(slots <= game.difficulty.expedition.capacity, `최대 ${game.difficulty.expedition.capacity}칸`);
    // 재고 변화 = 밤사이 소비 + 가져온 물품 + 길에서 주운 것
    const gained = { food: report.extra.food, water: report.extra.water };
    for (const id of report.items) for (const [k, n] of Object.entries(ITEMS[id].gives)) gained[k] = (gained[k] ?? 0) + n;
    for (const key of Object.keys(game.stock)) {
      assert.equal(game.stock[key], before[key] - (used[key] ?? 0) + (gained[key] ?? 0), `seed ${seed}: ${key}`);
    }
  }
  assert.ok(returned > 30, `40번 중 ${returned}번 무사히 돌아옴`);
  assert.ok(durations.size >= 2, '돌아오는 날이 매번 다르다');
});

test('탐사에서는 마트 재고와 상관없이 모든 물품이 무작위로 나온다', () => {
  // 마트를 완전히 비워도 탐사 결과는 달라지지 않는다
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const loot = rollLoot({ rng: new Rng(seed), capacity: 4, found: [1, 2] });
    for (const id of loot.items) seen.add(id);
    const slots = loot.items.reduce((sum, id) => sum + ITEMS[id].slots, 0);
    assert.ok(slots <= 4);
    assert.ok(loot.items.length >= 1);
    const extra = loot.extra.food + loot.extra.water;
    assert.ok(extra >= 1 && extra <= 2, '길에서 식량·물을 1~2개 줍는다');
  }
  assert.deepEqual([...seen].sort(), Object.keys(ITEMS).sort(), '모든 물품이 나올 수 있다');
  assert.deepEqual(Object.keys(LOOT_WEIGHTS).sort(), Object.keys(ITEMS).sort());

  const game = homeGame({ seed: 77, stock: { food: 50, water: 50 } });
  for (const key of Object.keys(game.martStock)) game.martStock[key] = 0;
  game.director.pick = () => null;
  let got = 0;
  for (let i = 0; i < 6 && game.phase === 'home'; i++) {
    const member = ['dad', 'mom', 'sis'].find((id) => !game.expeditionReason(id));
    if (!member) break;
    game.sendExpedition({ memberId: member });
    untilReturn(game);
    got += game.expeditionReport?.items.length ?? 0;
  }
  assert.ok(got > 0, '마트가 비어 있어도 물품을 가져온다');
  assert.deepEqual(Object.values(game.martStock).reduce((a, b) => a + b, 0), 0, '마트 재고는 탐사와 무관하다');
  assert.equal(Object.keys(initialMartStock()).length, Object.keys(game.martStock).length);
});

test('열린 탈출 경로에 필요한 물품은 조금 더 잘 나온다', () => {
  const count = (needs) => {
    let n = 0;
    for (let seed = 1; seed <= 600; seed++) n += rollItems({ rng: new Rng(seed), slots: 4, needs }).filter((id) => id === 'flare').length;
    return n;
  };
  assert.ok(count(['flare']) > count([]) * 1.8);

  const game = homeGame({ seed: 5, stock: { food: 9, water: 9, radio: 1, battery: 1 } });
  assert.deepEqual(game.neededItems(), ['bandage'], '다친 동생이 있는데 구급약이 없으면 약부터 찾는다');
  game.person('sis').health = 0;
  assert.deepEqual(game.neededItems(), [], '열린 경로도 다친 사람도 없으면 특별히 필요한 것이 없다');
  game.director.chains.rescue.opened = true;
  assert.deepEqual(game.neededItems(), ['flare']);
  game.director.chains.car.opened = true;
  game.director.chains.car.stage = 2;
  assert.deepEqual(game.neededItems(), ['flare', 'fuel', 'roadmap']);
});

test('탐사를 거듭할수록 위험해지고, 아빠나 방망이가 있으면 덜 위험하며, 난이도에 따라 달라진다', () => {
  const mom = { trait: 'medic', health: 0, hunger: 0, thirst: 0 };
  const dad = { trait: 'guard', health: 0, hunger: 0, thirst: 0 };
  const hurt = { ...mom, health: 1 };
  assert.ok(expeditionRisk(mom, { count: 5 }).lost > expeditionRisk(mom, { count: 0 }).lost);
  assert.ok(expeditionRisk(mom, { count: 5 }).injury > expeditionRisk(mom, { count: 0 }).injury);
  assert.ok(expeditionRisk(dad).lost < expeditionRisk(mom).lost);
  assert.ok(expeditionRisk(mom, { withWeapon: true }).lost < expeditionRisk(mom).lost);
  assert.ok(expeditionRisk(hurt).lost > expeditionRisk(mom).lost, '다친 사람은 더 위험하다');

  const risks = ['easy', 'hard', 'apocalypse'].map((difficulty) => homeGame({ seed: 3, difficulty }).expeditionRisk('mom').lost);
  assert.ok(risks[0] < risks[1] && risks[1] < risks[2], `난이도별 실종 위험 ${risks.map((r) => r.toFixed(3)).join(' < ')}`);
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
  for (const other of Object.values(game.director.chains)) if (other !== chain && other.status === 'scheduled') other.due = game.day + 30;
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

test('쉬지 않고 연달아 탐사를 보내면 다치거나 돌아오지 못할 위험이 커지고, 며칠 쉬면 풀린다', () => {
  const game = homeGame({ seed: 71, stock: { food: 99, water: 99 } });
  game.director.randomEvents = [];
  game.director.pick = () => null;
  const fresh = game.expeditionRisk('mom');
  assert.equal(game.nextTripStreak(), 1);
  assert.equal(renderHome(game).includes('data-ref="tired"'), false, '쉬었으면 경고가 없다');

  // 보내고, 돌아오자마자 다시 보내기를 되풀이한다
  const risks = [];
  for (let trip = 0; trip < 3; trip++) {
    risks.push(game.expeditionRisk('mom'));
    game.sendExpedition({ memberId: 'mom' });
    game.expedition.risk = { lost: 0, injury: 0 }; // 이 검사에서는 무사히 돌아오게 한다
    for (let d = 0; d < 8 && game.expedition; d++) game.endDay();
    assert.equal(game.person('mom').status, 'home');
  }
  assert.ok(risks[1].lost > risks[0].lost * 1.3 && risks[1].injury > risks[0].injury * 1.2, '두 번째 연속 탐사는 더 위험하다');
  assert.ok(risks[2].lost > risks[1].lost, '세 번째는 더 위험하다');
  assert.equal(game.nextTripStreak(), 4);
  assert.match(renderHome(game), /연달아 탐사를 보내 모두 지쳐 있다/);
  assert.doesNotMatch(renderHome(game), /%/, '수치는 보이지 않는다');

  // 아무도 나가지 않은 밤을 보내면 하룻밤마다 하나씩 풀린다
  game.endDay();
  assert.equal(game.nextTripStreak(), 3);
  for (let d = 0; d < 3; d++) game.endDay();
  assert.equal(game.nextTripStreak(), 1);
  const rested = game.expeditionRisk('mom');
  assert.ok(rested.lost < risks[1].lost && rested.injury < risks[1].injury, '충분히 쉬면 연달아 보낼 때보다 덜 위험하다');
  assert.ok(rested.lost < fresh.lost * 1.5, '탐사를 여러 번 했다는 것만큼만 더 위험하다');
});
