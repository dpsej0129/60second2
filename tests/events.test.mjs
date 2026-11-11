import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_QUIET_DAYS } from '../src/core/constants.js';
import { Game } from '../src/core/game.js';
import { CHAINS, RANDOM_EVENTS } from '../src/core/events/index.js';
import { EventDirector } from '../src/core/events/director.js';
import { Rng } from '../src/core/rng.js';
import { homeGame } from './helpers/setup.mjs';
import { chooseOption, playGame } from './helpers/strategy.mjs';

/** 경로를 모두 거절하고 물자를 넉넉히 준 채 days일을 보낸다(사건 배치만 관찰). */
function observe(seed, days, target = 'none') {
  const game = homeGame({ seed, stock: { food: 500, water: 500, med: 50 }, bonus: true });
  while (game.phase === 'home' && game.day <= days) {
    for (let i = 0; i < 4 && game.phase === 'home' && game.event && !game.event.resolved; i++) {
      game.chooseOption(chooseOption(game, target));
    }
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
      if (chain.kind === 'path') (firstDay[chain.id] ??= new Set()).add(chain.due);
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
  const gaps = {};
  let missionStages = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const game = playGame(new Game({ seed, zombies: false, difficulty: 'easy' }), { target: 'all', maxDays: 40 });
    for (const chain of Object.values(game.director.chains)) {
      let prev = null;
      for (const entry of chain.log) {
        assert.equal(entry.day, entry.scheduledFor, `seed ${seed} ${chain.id}: 예약일(${entry.scheduledFor})에 발생해야 한다`);
        if (prev) {
          assert.ok(entry.day > prev.day, '앞 단계 이후에 열린다');
          // 탈출 경로는 단계를 건너뛰지 않는다(미션은 감자 다시 심기처럼 앞 단계로 돌아가기도 한다)
          if (chain.kind === 'path') assert.ok(entry.stage === prev.stage || entry.stage === prev.stage + 1);
          (gaps[chain.id] ??= new Set()).add(entry.day - prev.day);
        }
        prev = entry;
      }
      if (chain.kind === 'mission') missionStages += chain.log.length;
    }
    // 하루에 연쇄 사건은 하나, 덤으로 일어나는 미션까지 합쳐도 둘을 넘지 않는다
    const perDay = {};
    for (const h of game.director.history) {
      if (!h.defId) continue;
      const d = (perDay[h.day] ??= { all: 0, chain: 0 });
      d.all += 1;
      if (h.kind === 'chain') d.chain += 1;
    }
    for (const [day, d] of Object.entries(perDay)) {
      assert.ok(d.chain <= 1, `seed ${seed} ${day}일차: 연쇄 사건 ${d.chain}개`);
      assert.ok(d.all <= 2, `seed ${seed} ${day}일차: 사건 ${d.all}개`);
    }
  }
  for (const id of ['rescue', 'group', 'car']) {
    assert.ok(gaps[id].size >= 2, `${id} 다음 단계까지 걸린 날짜가 무작위로 다르다 (${[...gaps[id]].join(',')})`);
  }
  assert.ok(missionStages >= 5, `미션 단계도 예약대로 일어난다 (${missionStages}번)`);
});

test('탈출 경로 일정이 미션보다 우선한다: 같은 날이면 미션이 밀린다', () => {
  const game = homeGame({ seed: 8, stock: { food: 99, water: 99 } });
  const d = game.director;
  const dog = d.chains.dog;
  const rescue = d.chains.rescue;
  d.controller('dog', game.day).begin([3, 3]);
  const dogDay = dog.due;
  rescue.stage = 1;
  rescue.opened = true;
  assert.equal(d.schedule(rescue, dogDay), dogDay, '탈출 경로는 원하는 날에 잡힌다');
  assert.ok(dog.due > dogDay, '미션이 뒤로 밀린다');
  const taken = Object.values(d.chains).filter((c) => c !== dog && c.status === 'scheduled').map((c) => c.due);
  assert.ok(!taken.includes(dog.due), '밀린 미션은 다른 예약과 겹치지 않는 날로 간다');
  // 미션끼리, 그리고 미션은 경로를 피해 잡힌다
  d.controller('garden', game.day).begin([dogDay - game.day, dogDay - game.day]);
  assert.ok(![rescue.due, dog.due].includes(d.chains.garden.due));
});

test('연쇄 사건이 있는 날에는 미션 사건이 덤으로 일어나기도 한다', () => {
  let bonus = 0;
  let chainDays = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const game = observe(seed, 25, 'all');
    const byDay = {};
    for (const h of game.director.history) (byDay[h.day] ??= []).push(h);
    for (const list of Object.values(byDay)) {
      if (list.some((h) => h.kind === 'chain')) chainDays += 1;
      const extra = list.filter((h) => h.kind === 'bonus');
      if (!extra.length) continue;
      bonus += 1;
      assert.equal(extra.length, 1);
      assert.ok(list.some((h) => h.kind === 'chain'), '덤 사건은 연쇄 사건이 있는 날에만');
      assert.ok(RANDOM_EVENTS.find((e) => e.id === extra[0].defId).bonus, '덤으로는 미션 사건만 나온다');
    }
  }
  assert.ok(bonus > 30 && bonus < chainDays, `연쇄 사건이 있던 ${chainDays}일 중 ${bonus}일에 덤 미션`);
});

test('열린 경로의 다음 단계는 언제나 예약되어 있다(무작위 때문에 끝까지 안 오는 일이 없다)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const game = homeGame({ seed, bonus: true, stock: { food: 500, water: 500, med: 50, radio: 1, battery: 20, flare: 0, fuel: 0, map: 0 } });
    while (game.phase === 'home' && game.day <= 40) {
      for (const chain of Object.values(game.director.chains)) {
        if (chain.status === 'scheduled') assert.ok(Number.isInteger(chain.due) && chain.due >= game.day);
        if (chain.status === 'active') assert.equal(game.event?.chainId, chain.id, '진행 중 단계는 오늘의 사건뿐');
      }
      for (let i = 0; i < 4 && game.phase === 'home' && game.event && !game.event.resolved; i++) {
        game.chooseOption(chooseOption(game, 'all'));
      }
      if (game.phase !== 'home') break;
      for (const chain of Object.values(game.director.chains)) {
        assert.ok(['idle', 'scheduled', 'done', 'failed'].includes(chain.status), `seed ${seed}: ${chain.id} 상태 ${chain.status}`);
        if (chain.opened && chain.status === 'scheduled') assert.ok(chain.due > game.day, '열린 경로·미션의 다음 단계는 앞날에 예약되어 있다');
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
