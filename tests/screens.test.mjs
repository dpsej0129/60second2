// 화면 템플릿(문자열)을 실제 게임 상태로 렌더링해 오류가 없는지 확인한다. DOM 없이 돈다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/core/game.js';
import { renderShelter } from '../src/ui/shelter.js';
import { renderEnding, renderHome, renderTitle } from '../src/ui/screens.js';
import { homeGame, resolveAnyEvent } from './helpers/setup.mjs';
import { playGame } from './helpers/strategy.mjs';

test('시작 화면', () => {
  assert.match(renderTitle({ seed: 123 }), /게임 시작/);
});

test('집 안 장면에 집에 있는 사람과 재고 물품이 그림으로 나타난다', () => {
  const game = homeGame({ seed: 1, bring: ['dad', 'sis'], stock: { food: 9, water: 4, med: 1, fuel: 2, radio: 1 } });
  let svg = renderShelter(game);
  for (const id of ['me', 'dad', 'sis']) assert.match(svg, new RegExp(`data-person="${id}"`));
  assert.doesNotMatch(svg, /data-person="mom"/, '데려오지 못한 엄마는 없다');
  assert.match(svg, /식량 9/);
  assert.match(svg, /물 4/);
  assert.match(svg, /연료통 2/);
  assert.match(svg, /무전기 1/);
  assert.doesNotMatch(svg, /신호탄/, '없는 물품은 그리지 않는다');
  assert.match(svg, /<rect x="-17" y="-121"/, '다친 동생은 붕대를 감고 있다');

  game.stock.food = 0;
  game.person('sis').health = 2;
  svg = renderShelter(game);
  assert.doesNotMatch(svg, /식량 \d/, '다 먹으면 선반에서 사라진다');
  assert.match(svg, /shelter-person critical" data-person="sis"/, '중상이면 누워 있다');

  resolveAnyEvent(game);
  game.sendExpedition({ memberId: 'dad' });
  svg = renderShelter(game);
  assert.doesNotMatch(svg, /data-person="dad"/, '탐사 중인 사람은 집 안에 없다');
  assert.match(svg, /탐사 중/);
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
        const html = renderHome(g, { expedition: { targetId: 'fuel' } });
        assert.match(html, /data-screen="home"/);
        assert.match(html, /data-ref="shelter"/);
        assert.match(html, new RegExp(`하루 필요량 <b>식량 ${g.presentPeople().length}`));
        rendered += 1;
      },
    });
    if (game.phase === 'home') renderHome(game);
    if (game.ending) assert.match(renderEnding(game), new RegExp(game.ending.title));
  }
  assert.ok(rendered > 20);
});
