import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS, earnedAchievements } from '../src/core/achievements.js';
import { ENDING_ORDER } from '../src/core/endings.js';
import { Game } from '../src/core/game.js';
import { renderEnding, renderTitle } from '../src/ui/screens.js';
import { homeGame, jumpToStage, stageEvent } from './helpers/setup.mjs';
import { playGame } from './helpers/strategy.mjs';

const has = (game, id, ctx) => earnedAchievements(game, ctx).includes(id);

test('업적: 목소리를 따라 집을 나간 식구(조현병 증상)', () => {
  const game = homeGame({ seed: 101, stock: { food: 20, water: 20 } });
  game.person('sis').mood = 4;
  stageEvent(game, 'voices', { target: 'sis' });
  let left = false;
  for (let seed = 0; seed < 30 && !left; seed++) {
    const g = homeGame({ seed: 200 + seed, stock: { food: 20, water: 20 } });
    g.person('sis').mood = 4;
    stageEvent(g, 'voices', { target: 'sis' });
    g.chooseOption('leave');
    if (g.person('sis').status === 'lost') {
      left = true;
      g.setEnding('died', { cause: '굶주림' });
      assert.ok(has(g, 'voices'));
    }
  }
  assert.ok(left, '혼자 두면 목소리를 따라 나가는 경우가 있다');
  game.setEnding('died', { cause: '굶주림' });
  assert.ok(!has(game, 'voices'), '아무도 나가지 않았으면 없다');
});

test('업적: 탈출 직전에 쓰러짐 — 탈출 경로가 마지막 단계만 남았을 때 진다', () => {
  const game = homeGame({ seed: 102, stock: { food: 20, water: 20 } });
  jumpToStage(game, 'rescue', 2);
  game.setEnding('died', { cause: '탈수' });
  assert.ok(has(game, 'so_close'));
  const calm = homeGame({ seed: 103 });
  calm.setEnding('died', { cause: '탈수' });
  assert.ok(!has(calm, 'so_close'));
});

test('업적: 가족 모두와 탈출, 아포칼립스 탈출, 이사, 모든 결말', () => {
  const game = homeGame({ seed: 104, difficulty: 'apocalypse', stock: { food: 20, water: 20, flare: 1 } });
  for (const p of game.presentPeople()) p.health = 0;
  jumpToStage(game, 'rescue', 2);
  game.chooseOption('flare');
  assert.equal(game.ending.id, 'rescue');
  const earned = earnedAchievements(game);
  assert.ok(earned.includes('together'));
  assert.ok(earned.includes('apocalypse_win'));
  assert.ok(!earned.includes('alone'));
  assert.ok(!earned.includes('collector'));
  assert.ok(has(game, 'collector', { discovered: ENDING_ORDER.filter((id) => id !== 'rescue') }), '이번 결말까지 합쳐 모두 보면');
});

test('업적이 결말·시작 화면에 나오고, 새로 이룬 업적이 표시된다', () => {
  const game = new Game({ seed: 105, zombies: false });
  playGame(game, { target: 'rescue', maxDays: 100 });
  const earned = earnedAchievements(game);
  assert.ok(earned.length >= 1, earned.join(','));
  const html = renderEnding(game, { achievements: earned, freshAchievements: earned });
  assert.match(html, /업적 달성/);
  assert.match(html, new RegExp(`업적 <span class="count">${earned.length} / ${ACHIEVEMENTS.length}</span>`));
  assert.match(renderTitle({ seed: 1, achievements: ['voices'] }), /class="ach got [^"]*" data-achievement="voices"/);
  assert.ok(ACHIEVEMENTS.length >= 15);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});
