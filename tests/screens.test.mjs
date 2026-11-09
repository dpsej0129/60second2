// 화면 템플릿(문자열)을 실제 게임 상태로 렌더링해 오류가 없는지 확인한다. DOM 없이 돈다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/core/game.js';
import { renderEnding, renderFamily, renderHome, renderTitle } from '../src/ui/screens.js';
import { arriveHome } from './helpers/setup.mjs';
import { playGame } from './helpers/strategy.mjs';

test('시작·가족 선택 화면', () => {
  assert.match(renderTitle({ seed: 123 }), /게임 시작/);
  const game = new Game({ seed: 1, zombies: false });
  game.startFirstRun();
  game.inventory.add('radio');
  arriveHome(game);
  const html = renderFamily(game);
  assert.match(html, /아빠/);
  assert.match(html, /하루 필요량 식량 1 → <b>2<\/b>/);
});

test('집·결말 화면이 게임 전 과정에서 오류 없이 그려진다', () => {
  let rendered = 0;
  for (const [target, seed, bring] of [
    ['rescue', 1, ['dad', 'mom', 'sis']],
    ['group', 2, ['dad']],
    ['car', 3, []],
    ['none', 4, ['mom', 'sis']],
  ]) {
    const game = new Game({ seed, zombies: false });
    playGame(game, {
      target,
      bring,
      maxDays: 25,
      onDay(g) {
        const html = renderHome(g);
        assert.match(html, /data-screen="home"/);
        assert.match(html, new RegExp(`하루 필요량 <b>식량 ${g.presentPeople().length}`));
        rendered += 1;
      },
    });
    if (game.phase === 'home') renderHome(game);
    if (game.ending) assert.match(renderEnding(game), new RegExp(game.ending.title));
  }
  assert.ok(rendered > 20);
});
