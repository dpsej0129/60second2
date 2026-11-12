import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_ORDER } from '../src/core/difficulty.js';
import { Game } from '../src/core/game.js';
import { homeGame, stageEvent } from './helpers/setup.mjs';

test('난이도는 이지·하드·아포칼립스 세 가지이고, 기본은 이지다', () => {
  assert.deepEqual(DIFFICULTY_ORDER, ['easy', 'hard', 'apocalypse']);
  assert.deepEqual(
    DIFFICULTY_ORDER.map((id) => DIFFICULTIES[id].name),
    ['이지', '하드', '아포칼립스'],
  );
  assert.equal(DEFAULT_DIFFICULTY, 'easy');
  assert.equal(new Game({ seed: 1 }).difficulty.id, 'easy');
  assert.equal(new Game({ seed: 1, difficulty: 'apocalypse' }).difficulty.name, '아포칼립스');
  assert.equal(new Game({ seed: 1, difficulty: '없는 난이도' }).difficulty.id, 'easy');
});

test('난이도가 오를수록 80초 동안 좀비가 많고 빠르고 멀리 본다', () => {
  const runs = DIFFICULTY_ORDER.map((difficulty) => {
    const game = new Game({ seed: 9, difficulty });
    game.startFirstRun();
    return game.run;
  });
  const [easy, hard, apoc] = runs;
  assert.ok(easy.zombies.length < hard.zombies.length && hard.zombies.length < apoc.zombies.length, runs.map((r) => r.zombies.length).join(' < '));
  assert.ok(easy.danger.speedMax < hard.danger.speedMax && hard.danger.speedMax < apoc.danger.speedMax);
  assert.ok(easy.danger.sight < hard.danger.sight && hard.danger.sight < apoc.danger.sight);
  assert.ok(easy.danger.spawnInterval > hard.danger.spawnInterval && hard.danger.spawnInterval > apoc.danger.spawnInterval);
  assert.ok(easy.danger.maxZombies < hard.danger.maxZombies && hard.danger.maxZombies < apoc.danger.maxZombies);
});

test('난이도가 오를수록 탐사가 위험하고 덜 들고 오며, 상처가 빨리 덧난다', () => {
  const games = DIFFICULTY_ORDER.map((difficulty) => homeGame({ seed: 4, difficulty }));
  const risk = games.map((g) => g.expeditionRisk('mom'));
  assert.ok(risk[0].lost < risk[1].lost && risk[1].lost < risk[2].lost);
  assert.ok(risk[0].injury < risk[1].injury && risk[1].injury < risk[2].injury);
  assert.deepEqual(
    games.map((g) => g.difficulty.expedition.capacity),
    [5, 4, 3],
  );
  assert.deepEqual(
    games.map((g) => g.difficulty.worsenDays),
    [4, 3, 2],
  );
});

test('난이도가 오를수록 사건에서 나쁜 결과가 자주 나온다', () => {
  const hurt = DIFFICULTY_ORDER.map((difficulty) => {
    let injuries = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const game = homeGame({ seed, bring: ['dad'], difficulty });
      stageEvent(game, 'raid');
      game.chooseOption('dad');
      injuries += game.person('dad').health;
    }
    return injuries;
  });
  assert.ok(hurt[0] < hurt[1] && hurt[1] < hurt[2], `아빠가 문을 막다 다친 횟수(150번 중) ${hurt.join(' < ')}`);
});
