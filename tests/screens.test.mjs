// 화면 템플릿(문자열)을 실제 게임 상태로 렌더링해 오류가 없는지 확인한다. DOM 없이 돈다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/core/game.js';
import { renderShelter } from '../src/ui/shelter.js';
import { renderEnding, renderHome, renderTitle } from '../src/ui/screens.js';
import { homeGame, resolveAnyEvent, stageEvent } from './helpers/setup.mjs';
import { playGame } from './helpers/strategy.mjs';

test('시작 화면에서 난이도를 고른다', () => {
  const html = renderTitle({ seed: 123, difficulty: 'hard' });
  assert.match(html, /게임 시작/);
  for (const name of ['이지', '하드', '아포칼립스']) assert.match(html, new RegExp(`<b>${name}</b>`));
  assert.match(html, /name="difficulty" value="hard" checked/);
  assert.doesNotMatch(html, /value="easy" checked/);
});

test('탐사 화면에는 돌아올 확률도, 마트에 남은 물자도 나오지 않는다', () => {
  const game = homeGame({ seed: 2, stock: { food: 9, water: 9, weapon: 1 } });
  resolveAnyEvent(game);
  const html = renderHome(game);
  const card = html.slice(html.indexOf('data-ref="expedition"'), html.indexOf('data-ref="actions"'));
  assert.match(card, /탐사 보내기/);
  assert.match(card, /무엇을 들고 올지는 알 수 없고/);
  assert.doesNotMatch(card, /%/, '확률을 보여 주지 않는다');
  assert.doesNotMatch(card, /<select/, '찾아올 것을 고를 수 없다');
  assert.doesNotMatch(html, /마트에 남은 물자/);
  assert.doesNotMatch(html, /data-ref="mart"/);
  assert.match(card, /야구 방망이 챙겨 보내기/);
});

test('미션과 이어서 일어난 사건이 집 화면에 나온다', () => {
  const game = homeGame({ seed: 3, stock: { food: 9, water: 9 } });
  assert.doesNotMatch(renderHome(game), /data-ref="missions"/, '시작한 미션이 없으면 칸도 없다');
  stageEvent(game, 'dog_stray');
  game.eventQueue.push({ defId: 'gambler', chainId: null, day: game.day, params: {}, resolved: false, outcome: null, choice: null });
  game.chooseOption('adopt');
  const html = renderHome(game);
  assert.match(html, /data-ref="missions"/);
  assert.match(html, /떠돌이 개 보리/);
  assert.match(html, /대응 완료/, '먼저 대응한 사건은 요약으로 남는다');
  assert.match(html, /이어서 일어난 사건/);
  assert.match(html, /data-event="gambler"/);
  assert.match(game.canEndDay(), /사건/, '이어진 사건까지 대응해야 하루를 마칠 수 있다');
  assert.match(renderShelter(game), /data-pet="dog"/, '집 안 장면에 보리가 보인다');
});

test('집 안 장면에 집에 있는 사람과 재고 물품이 그림으로 나타난다', () => {
  const game = homeGame({ seed: 1, bring: ['dad', 'sis'], stock: { food: 9, water: 4, med: 1, fuel: 2, radio: 1 } });
  let svg = renderShelter(game);
  for (const id of ['me', 'dad', 'sis']) assert.match(svg, new RegExp(`data-person="${id}"`));
  assert.doesNotMatch(svg, /data-person="mom"/, '데려오지 못한 엄마는 없다');
  assert.match(svg, /통조림 2¼캔/, '9번 = 2¼캔');
  assert.match(svg, /data-left="1"/, '딴 캔은 ¼만 남아 흐리게 보인다');
  assert.match(svg, /물 1병/);
  assert.match(svg, /연료통 2/);
  assert.match(svg, /무전기 1/);
  assert.doesNotMatch(svg, /신호탄/, '없는 물품은 그리지 않는다');
  assert.match(svg, /<rect x="-17" y="-121"/, '다친 동생은 붕대를 감고 있다');

  game.stock.food = 0;
  game.person('sis').health = 2;
  svg = renderShelter(game);
  assert.doesNotMatch(svg, /통조림 \d/, '다 먹으면 선반에서 사라진다');
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
        const html = renderHome(g, { expedition: { memberId: 'mom' } });
        assert.match(html, /data-screen="home"/);
        assert.match(html, /data-ref="shelter"/);
        assert.match(html, new RegExp(`전원 한 끼 <b>식량 ${g.presentPeople().length}`));
        rendered += 1;
      },
    });
    if (game.phase === 'home') renderHome(game);
    if (game.ending) assert.match(renderEnding(game), new RegExp(game.ending.title));
  }
  assert.ok(rendered > 20);
});
