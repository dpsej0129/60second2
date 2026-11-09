import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_QUIET_DAYS } from '../src/core/constants.js';
import { Game } from '../src/core/game.js';
import { CHAINS } from '../src/core/events/index.js';
import { EventDirector } from '../src/core/events/director.js';
import { RANDOM_EVENTS } from '../src/core/events/random.js';
import { Rng } from '../src/core/rng.js';
import { homeGame } from './helpers/setup.mjs';
import { chooseOption, playGame } from './helpers/strategy.mjs';

/** 경로를 모두 거절하고 물자를 넉넉히 준 채 days일을 보낸다(사건 배치만 관찰). */
function observe(seed, days, target = 'none') {
  const game = homeGame({ seed, stock: { food: 500, water: 500, med: 50 } });
  while (game.phase === 'home' && game.day <= days) {
    if (game.event && !game.event.resolved) game.chooseOption(chooseOption(game, target));
    if (game.phase !== 'home') break;
    game.endDay();
  }
  return game;
}

test(`사건 없는 날은 ${MAX_QUIET_DAYS}일 넘게 연속되지 않는다 (300게임 × 30일)`, () => {
  let forced = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const game = observe(seed, 30);
    let streak = 0;
    for (const h of game.director.history) {
      if (h.defId) {
        if (streak >= MAX_QUIET_DAYS) assert.equal(h.kind === 'forced' || h.kind === 'chain', true);
        streak = 0;
      } else {
        streak += 1;
        assert.ok(streak <= MAX_QUIET_DAYS, `seed ${seed}: ${h.day}일차까지 ${streak}일 연속 조용함`);
      }
      if (h.kind === 'forced') forced += 1;
    }
  }
  assert.ok(forced > 0, '상한 때문에 강제로 일어난 사건이 실제로 있다');
});

test('반드시 일어나야 하는 날에는 조건을 만족하는 사건 중에서 고른다', () => {
  // 확률을 0으로 두면 상한 규칙만으로 사건이 일어난다.
  const director = new EventDirector({ rng: new Rng(7), chains: [], randomEvents: RANDOM_EVENTS, chance: 0 });
  // 모두 데려오고 동생 부상도 치료 → '부상 악화'와 '돌아온 가족'은 조건을 만족하지 못한다.
  const game = homeGame({ seed: 7 });
  game.person('sis').health = 0;
  const days = [];
  for (let day = 1; day <= 30; day++) {
    const inst = director.pick(day, game);
    if (inst) days.push([day, inst.defId]);
  }
  assert.ok(days.length >= 9, `30일 중 ${days.length}번 발생`);
  for (const [day, id] of days) {
    // 1일차(귀가 첫날)도 조용한 날로 세므로 3, 6, 9…일차에 강제로 일어난다.
    assert.equal(day % (MAX_QUIET_DAYS + 1), 0, `${day}일차: 조용한 날 ${MAX_QUIET_DAYS}일 뒤에만 강제 발생`);
    assert.notEqual(id, 'injury_worse', '부상자가 없으면 부상 악화는 뽑히지 않는다');
    assert.notEqual(id, 'family_return', '두고 온 가족이 없으면 돌아온 가족도 없다');
  }
});

test('게임마다 사건 발생일이 달라진다', () => {
  const firstDay = {};
  const sequences = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const game = new Game({ seed });
    for (const chain of Object.values(game.director.chains)) {
      (firstDay[chain.id] ??= new Set()).add(chain.due);
    }
    const observed = observe(seed, 15);
    sequences.add(observed.director.history.map((h) => h.defId ?? '-').join(','));
  }
  for (const [id, days] of Object.entries(firstDay)) {
    assert.ok(days.size >= 3, `${id} 첫 사건 날짜 후보 ${[...days].join(',')}`);
  }
  assert.ok(sequences.size >= 55, `60게임 중 서로 다른 사건 배치 ${sequences.size}개`);
});

test('같은 시드면 같은 사건 배치가 나온다', () => {
  const a = observe(1234, 20).director.history;
  const b = observe(1234, 20).director.history;
  assert.deepEqual(a, b);
});

test('연쇄 사건은 앞 단계가 끝난 뒤에만 다음 단계가 열리고, 예약된 날에 반드시 일어난다', () => {
  const stageDays = { rescue: new Set(), group: new Set(), car: new Set() };
  for (let seed = 1; seed <= 40; seed++) {
    const game = playGame(new Game({ seed, zombies: false }), { target: 'all', maxDays: 40 });
    for (const chain of Object.values(game.director.chains)) {
      let prev = null;
      for (const entry of chain.log) {
        assert.equal(entry.day, entry.scheduledFor, `seed ${seed} ${chain.id}: 예약일(${entry.scheduledFor})에 발생해야 한다`);
        if (prev) {
          assert.ok(entry.stage === prev.stage || entry.stage === prev.stage + 1, '단계를 건너뛰지 않는다');
          assert.ok(entry.day > prev.day, '앞 단계 이후에 열린다');
        }
        if (entry.stage > 0) stageDays[chain.id].add(entry.day - (prev?.day ?? 0));
        prev = entry;
      }
    }
    // 하루에 사건은 하나뿐이다
    const days = game.director.history.map((h) => h.day);
    assert.equal(new Set(days).size, days.length);
  }
  for (const [id, gaps] of Object.entries(stageDays)) {
    assert.ok(gaps.size >= 2, `${id} 다음 단계까지 걸린 날짜가 무작위로 다르다 (${[...gaps].join(',')})`);
  }
});

test('열린 경로의 다음 단계는 언제나 예약되어 있다(무작위 때문에 끝까지 안 오는 일이 없다)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const game = homeGame({ seed, stock: { food: 500, water: 500, med: 50, radio: 1, battery: 20, flare: 0, fuel: 0, map: 0 } });
    while (game.phase === 'home' && game.day <= 40) {
      for (const chain of Object.values(game.director.chains)) {
        if (chain.status === 'scheduled') assert.ok(Number.isInteger(chain.due) && chain.due > game.day);
        if (chain.status === 'active') assert.equal(game.event?.chainId, chain.id, '진행 중 단계는 오늘의 사건뿐');
      }
      if (game.event && !game.event.resolved) game.chooseOption(chooseOption(game, 'all'));
      if (game.phase !== 'home') break;
      for (const chain of Object.values(game.director.chains)) {
        assert.ok(['scheduled', 'done', 'failed'].includes(chain.status), `seed ${seed}: ${chain.id} 상태 ${chain.status}`);
      }
      game.endDay();
    }
  }
});

test('모든 사건에는 항상 고를 수 있는 선택지가 있다', () => {
  const defs = [...RANDOM_EVENTS, ...CHAINS.flatMap((c) => c.stages)];
  for (const def of defs) {
    assert.ok(
      def.options.some((o) => !o.check),
      `${def.id}: 조건 없는 선택지가 하나는 있어야 한다`,
    );
  }
});

test('가족 구성에 따라 사건 선택지가 달라진다', () => {
  const withDad = homeGame({ bring: ['dad'], stock: { food: 10, water: 10 } });
  const alone = homeGame({ bring: [], stock: { food: 10, water: 10 } });
  for (const game of [withDad, alone]) {
    game.event = { defId: 'raid', chainId: null, day: game.day, params: {}, resolved: false, outcome: null, choice: null };
  }
  const dadOption = (g) => g.eventView().options.find((o) => o.id === 'dad');
  assert.equal(dadOption(withDad).disabled, false);
  assert.equal(dadOption(alone).disabled, true);
  assert.match(dadOption(alone).reason, /집에 없다/);
});
