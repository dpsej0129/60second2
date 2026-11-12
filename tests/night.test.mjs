// 밤사이 사건과 아포칼립스에서만 일어나는 사건
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APOCALYPSE_EVENTS } from '../src/core/events/apocalypse.js';
import { NIGHT_EVENTS, eligibleNightEvents, rollNightEvent } from '../src/core/events/night.js';
import { Game } from '../src/core/game.js';
import { SERVINGS } from '../src/core/items.js';
import { Rng } from '../src/core/rng.js';
import { renderHome } from '../src/ui/screens.js';
import { homeGame, stageEvent } from './helpers/setup.mjs';
import { playGame } from './helpers/strategy.mjs';

test('밤사이 사건: 쥐가 갉아 먹고, 빗물이 고이고, 잠을 못 이루는 일이 아침 일지에 적힌다', () => {
  const game = homeGame({ seed: 81, night: true, stock: { food: 20, water: 20, med: 2 } });
  game.director.randomEvents = [];
  game.director.pick = () => null;
  const seen = new Set();
  for (let d = 0; d < 60 && game.phase === 'home'; d++) {
    game.setAllRations(true);
    game.endDay();
    game.stock.food = Math.max(game.stock.food, 20);
    game.stock.water = Math.max(game.stock.water, 20);
    for (const id of Object.keys(game.nightHistory)) seen.add(id);
  }
  for (const id of ['insomnia', 'rats', 'rain', 'scratching']) assert.ok(seen.has(id), `${id}: ${[...seen].join(',')}`);
  assert.ok(!seen.has('blood_moon'), '아포칼립스 전용 밤 사건은 하드에서 일어나지 않는다');
  const nights = game.log.filter((e) => e.kind === 'night' && /쥐가|빗물|냄비|한숨도 자지 못했다|현관문을 긁었다/.test(e.text));
  assert.ok(nights.length >= 4, '일지에 적힌다');
  assert.ok(game.journal.some((page) => page.entries.some((e) => /쥐가|냄비에/.test(e.text))));
});

test('밤사이 사건의 효과: 쥐는 통조림을, 비는 물을, 보리가 있으면 쥐를 쫓는다', () => {
  const game = homeGame({ seed: 82, stock: { food: 10, water: 0 } });
  const rats = NIGHT_EVENTS.find((e) => e.id === 'rats');
  const out = rats.run(game, new Rng(1));
  assert.ok(game.stock.food < 10 && game.stock.food >= 8);
  assert.match(out.text, /쥐가 통조림 (¼|½)캔을 갉아 먹었다/);
  game.flags.dog = true;
  rats.run(game, new Rng(2));
  assert.ok(game.stock.food >= 8, '보리가 지킨다');
  NIGHT_EVENTS.find((e) => e.id === 'rain').run(game, new Rng(3));
  assert.ok(game.stock.water >= 1);
  // 같은 밤 사건은 사흘 안에 되풀이되지 않는다
  game.nightHistory.rain = game.day;
  assert.ok(!eligibleNightEvents(game).some((e) => e.id === 'rain'));
});

test('난이도가 높을수록 밤에 나쁜 일이 더 잦다', () => {
  const badShare = (difficulty) => {
    let bad = 0;
    let all = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const game = homeGame({ seed, difficulty, stock: { food: 20, water: 20, med: 2 } });
      const r = rollNightEvent(game, new Rng(seed * 7));
      if (!r) continue;
      all += 1;
      if (r.tone === 'bad' || r.tone === 'warn') bad += 1;
    }
    return { rate: all / 400, bad: bad / all };
  };
  const easy = badShare('easy');
  const apo = badShare('apocalypse');
  assert.ok(apo.rate > easy.rate, `발생 ${easy.rate} → ${apo.rate}`);
  assert.ok(apo.bad > easy.bad, `나쁜 일 비율 ${easy.bad.toFixed(2)} → ${apo.bad.toFixed(2)}`);
});

test('아포칼립스에서만 일어나는 사건이 있고, 다른 난이도에서는 일어나지 않는다', () => {
  assert.ok(APOCALYPSE_EVENTS.length >= 4);
  const hard = homeGame({ seed: 83, difficulty: 'hard', stock: { food: 40, water: 40 } });
  const apo = homeGame({ seed: 83, difficulty: 'apocalypse', stock: { food: 40, water: 40 } });
  for (const def of APOCALYPSE_EVENTS) {
    hard.day = 40;
    apo.day = 40;
    assert.equal(def.when(hard), false, def.id);
    assert.equal(def.when(apo), true, def.id);
  }
  const view = stageEvent(apo, 'mutant');
  assert.equal(view.apocalypse, true);
  assert.match(renderHome(apo), /종말의 징조/);
  apo.chooseOption('hide');
  assert.ok(apo.stock.food < 40, '숨어 있는 동안 선반을 헤집는다');

  // 실제 플레이에서도 아포칼립스에서만 나온다
  const ids = new Set(APOCALYPSE_EVENTS.map((e) => e.id));
  const count = (difficulty) => {
    let n = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = playGame(new Game({ seed, zombies: false, difficulty }), { target: 'rescue', maxDays: 50 });
      n += g.director.history.filter((h) => ids.has(h.defId)).length;
    }
    return n;
  };
  assert.equal(count('hard'), 0);
  assert.ok(count('apocalypse') >= 6);
});

test('산성비: 공구 상자로 막으면 무사하고, 그냥 두면 물을 버린다', () => {
  const game = homeGame({ seed: 84, difficulty: 'apocalypse', stock: { food: 40, water: 4 * SERVINGS, toolkit: 1 } });
  stageEvent(game, 'acid_rain');
  game.chooseOption('toolkit');
  assert.equal(game.stock.water, 4 * SERVINGS);
  stageEvent(game, 'acid_rain');
  game.chooseOption('endure');
  assert.ok(game.stock.water < 4 * SERVINGS);
});
