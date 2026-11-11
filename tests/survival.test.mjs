import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUNGER_DEATH, HUNGER_NOTICE, THIRST_DEATH, THIRST_NOTICE } from '../src/core/constants.js';
import { homeGame, passDays, resolveAnyEvent } from './helpers/setup.mjs';

test('60초 동안 데려온 가족만 집에 있고, 나머지는 남겨진다', () => {
  const none = homeGame({ bring: [] });
  assert.equal(none.phase, 'home');
  assert.deepEqual(
    none.people.map((p) => [p.id, p.status]),
    [
      ['me', 'home'],
      ['dad', 'left'],
      ['mom', 'left'],
      ['sis', 'left'],
    ],
  );
  const some = homeGame({ bring: ['dad', 'sis'] });
  assert.deepEqual(
    some.presentPeople().map((p) => p.id),
    ['me', 'dad', 'sis'],
  );
});

test('데려온 가족이 많을수록 한 끼에 필요한 식량·물과 실제 소비가 늘어난다', () => {
  const used = {};
  for (const bring of [[], ['dad'], ['dad', 'mom'], ['dad', 'mom', 'sis']]) {
    const game = homeGame({ bring, stock: { food: 20, water: 20 } });
    const need = game.dailyNeed();
    assert.equal(need.people, bring.length + 1);
    assert.equal(need.food, bring.length + 1);
    assert.equal(need.water, bring.length + 1);
    resolveAnyEvent(game);
    game.setAllRations(true); // 전원에게 한 끼씩
    assert.equal(game.rationCount('food'), need.food);
    game.endDay();
    used[bring.length + 1] = { food: 20 - game.stock.food, water: 20 - game.stock.water };
  }
  assert.deepEqual(used, {
    1: { food: 1, water: 1 },
    2: { food: 2, water: 2 },
    3: { food: 3, water: 3 },
    4: { food: 4, water: 4 },
  });
});

test('식량·물 1개는 한 사람의 한 끼이고, 기본 배급표는 배고프거나 목마른 사람에게만 준다', () => {
  const game = homeGame({ bring: ['dad'], stock: { food: 10, water: 10 } });
  game.director.pick = () => null; // 사건 없이 배급만 본다
  assert.equal(game.rationCount('food'), 0, '첫날은 아무도 배고프지 않다');
  assert.equal(game.rationCount('water'), 0);
  const drankOn = [];
  const ateOn = [];
  for (let i = 0; i < 9; i++) {
    const before = { ...game.stock };
    const day = game.day;
    game.endDay();
    if (game.stock.water < before.water) drankOn.push(day);
    if (game.stock.food < before.food) ateOn.push(day);
    assert.ok(game.me.thirst <= THIRST_NOTICE && game.me.hunger <= HUNGER_NOTICE, '기본 배급만으로 버틴다');
  }
  assert.deepEqual(drankOn, [3, 6, 9], `물은 ${THIRST_NOTICE + 1}일에 한 번`);
  assert.deepEqual(ateOn, [4, 8], `식량은 ${HUNGER_NOTICE + 1}일에 한 번`);
  assert.equal(game.stock.water, 10 - 3 * 2, '두 사람이 세 번 마셨다');
  assert.equal(game.stock.food, 10 - 2 * 2);
});

test('배급을 받지 못하면 배고픔·목마름이 쌓이고, 받으면 회복한다', () => {
  const game = homeGame({ bring: ['dad'], stock: { food: 5, water: 5 } });
  resolveAnyEvent(game);
  game.setAllRations(true);
  game.setRation('dad', 'food', false);
  game.setRation('dad', 'water', false);
  game.endDay();
  const dad = game.person('dad');
  const me = game.person('me');
  assert.equal(dad.hunger, 1);
  assert.equal(dad.thirst, 1);
  assert.equal(me.hunger, 0);
  assert.equal(me.thirst, 0);
  assert.equal(game.stock.food, 4);
  assert.equal(game.stock.water, 4);
});

test('재고보다 많이 배급할 수는 없다', () => {
  const game = homeGame({ bring: ['dad', 'mom', 'sis'], stock: { food: 2, water: 1 } });
  resolveAnyEvent(game);
  game.setAllRations(true);
  assert.equal(game.rationCount('food'), 2);
  assert.equal(game.rationCount('water'), 1);
  const without = game.presentPeople().find((p) => !game.rations[p.id].water);
  assert.equal(game.setRation(without.id, 'water', true), false);
  assert.equal(game.rationCount('water'), 1);
});

test('물이 없으면 며칠 뒤 숨지고, 주인공이 숨지면 패배한다', () => {
  const game = homeGame({ bring: [], stock: { food: 50, water: 0 } });
  passDays(game, 20);
  assert.equal(game.phase, 'ending');
  assert.equal(game.ending.type, 'defeat');
  assert.equal(game.ending.id, 'died');
  assert.equal(game.ending.cause, '탈수');
  assert.equal(game.me.thirst, THIRST_DEATH);
  assert.equal(game.ending.day, THIRST_DEATH, `물 없이 ${THIRST_DEATH}일째 밤에 숨진다`);
  assert.ok(THIRST_DEATH < HUNGER_DEATH);
});

test('치료하지 않은 부상은 악화되고, 구급약·엄마의 간호로 막을 수 있다', () => {
  const game = homeGame({ bring: ['mom', 'sis'], stock: { food: 50, water: 50 } });
  game.director.pick = () => null; // 사건 없이 부상 진행만 본다
  const sis = game.person('sis');
  assert.equal(sis.health, 1, '동생은 다친 채로 시작');
  const days = game.difficulty.worsenDays;
  for (let i = 0; i < days - 1; i++) game.endDay();
  assert.equal(sis.health, 1);
  game.endDay();
  assert.equal(sis.health, 2, `${days}일 동안 치료받지 못하면 중상으로 악화된다`);

  const g2 = homeGame({ bring: ['mom', 'sis'], stock: { food: 50, water: 50, med: 1 } });
  g2.director.pick = () => null;
  const s2 = g2.person('sis');
  for (let i = 0; i < days + 2; i++) {
    assert.equal(g2.momCareReason('sis'), null);
    assert.ok(g2.momCare('sis'));
    assert.match(g2.momCareReason('sis'), /오늘/);
    g2.endDay();
    assert.equal(s2.health, 1, '엄마가 매일 간호하면 악화되지 않는다');
  }
  assert.ok(g2.useMed('sis'));
  assert.equal(s2.health, 0, '구급약으로 낫는다');
  assert.equal(g2.stock.med, 0);
});

test('사건을 해결하기 전에는 하루를 마치거나 탐사를 보낼 수 없다', () => {
  for (let seed = 1; seed < 200; seed++) {
    const game = homeGame({ seed, stock: { food: 50, water: 50 } });
    for (let d = 0; d < 6 && game.phase === 'home'; d++) {
      if (game.event && !game.event.resolved) {
        assert.match(game.canEndDay(), /사건/);
        assert.match(game.expeditionReason('dad'), /사건/);
        assert.equal(game.sendExpedition({ memberId: 'dad' }), false);
        assert.equal(game.endDay(), false);
        return;
      }
      game.endDay();
    }
  }
  assert.fail('사건이 있는 날을 찾지 못했다');
});
