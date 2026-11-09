import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../src/core/game.js';
import { homeGame, resolveAnyEvent } from './helpers/setup.mjs';
import { chooseOption, playGame } from './helpers/strategy.mjs';

/** 지정한 연쇄 단계가 다음 날 일어나도록 맞춘 뒤 그날로 넘어간다(조건 검사용). */
function jumpToStage(game, chainId, stage, data = {}) {
  const chain = game.director.chains[chainId];
  chain.stage = stage;
  chain.opened = stage > 0;
  chain.seen = true;
  Object.assign(chain.data, data);
  for (const other of Object.values(game.director.chains)) {
    if (other !== chain && other.status === 'scheduled' && other.due <= game.day + 1) other.due = game.day + 30;
  }
  game.director.schedule(chain, game.day + 1);
  resolveAnyEvent(game);
  game.endDay();
  assert.equal(game.event?.chainId, chainId);
  return game.eventView();
}

const option = (view, id) => view.options.find((o) => o.id === id);

for (const target of ['rescue', 'group', 'car']) {
  test(`승리 경로 「${target}」: 마트 탈출 → 가족 선택 → 사건 → 반복 보급 → 결말까지 실제로 도달한다`, () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = playGame(new Game({ seed, zombies: false }), { target, maxDays: 40 });
      assert.equal(game.phase, 'ending', `seed ${seed}`);
      assert.equal(game.ending.type, 'victory', `seed ${seed}: ${game.ending.id}`);
      assert.equal(game.ending.id, target, `seed ${seed}`);
      assert.ok(game.runs >= 2, '추가 보급을 반복했다');
      const path = game.pathsView().find((p) => p.id === target);
      assert.equal(path.status, 'done');
    }
  });
}

test('경로를 모두 거절하면, 물자가 넉넉해 60일을 버텨도 승리하지 못한다', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const game = homeGame({ seed, stock: { food: 999, water: 999, med: 99 } });
    while (game.phase === 'home' && game.day <= 60) {
      if (game.event && !game.event.resolved) game.chooseOption(chooseOption(game, 'none'));
      if (game.phase !== 'home') break;
      game.endDay();
    }
    assert.notEqual(game.ending?.type, 'victory', `seed ${seed}`);
    assert.ok(game.day > 60 || game.ending, '60일을 넘겼다');
    for (const chain of Object.values(game.director.chains)) assert.equal(chain.status, 'failed', `${chain.id}는 닫혔다`);
    assert.ok(game.pathsView().every((p) => p.status === 'closed'));
  }
});

test('구조 헬기: 신호탄이 없으면 탈출할 수 없고, 한 번 더 기회를 준 뒤 경로가 닫힌다', () => {
  const game = homeGame({ seed: 21, stock: { food: 99, water: 99 } });
  let view = jumpToStage(game, 'rescue', 2, { arrivalDay: game.day + 1 });
  assert.equal(option(view, 'flare').disabled, true);
  assert.match(option(view, 'flare').reason, /신호탄/);
  game.chooseOption('pass');
  assert.equal(game.ending, null);
  const chain = game.director.chains.rescue;
  assert.equal(chain.status, 'scheduled');
  assert.equal(chain.due, game.day + 2, '구조대가 알려 준 날 다시 온다');
  assert.match(game.pathsView().find((p) => p.id === 'rescue').next, /마지막 기회/);

  // 다시 온 날에도 신호탄이 없으면 닫힌다
  game.endDay();
  resolveAnyEvent(game);
  game.endDay();
  assert.equal(game.event.defId, 'rescue_arrival');
  game.chooseOption('pass');
  assert.equal(chain.status, 'failed');
  assert.equal(game.ending, null);
});

test('구조 헬기: 중상자가 있으면 모두 함께 탈 수 없어, 두고 가거나 기다려야 한다', () => {
  const game = homeGame({ seed: 22, stock: { food: 99, water: 99, flare: 1 } });
  game.person('sis').health = 2;
  const view = jumpToStage(game, 'rescue', 2);
  assert.equal(option(view, 'flare').disabled, true);
  assert.match(option(view, 'flare').reason, /동생/);
  assert.equal(option(view, 'flare_leave').disabled, false);
  game.chooseOption('flare_leave');
  assert.equal(game.ending.id, 'rescue');
  assert.deepEqual(game.ending.leftBehind, ['동생']);
  assert.ok(!game.ending.survivors.includes('동생'));
});

test('구조 무전: 무전기가 없어도 동생이 있으면 응답할 수 있다', () => {
  const withSis = homeGame({ seed: 23, stock: { food: 99, water: 99, battery: 1 } });
  withSis.person('sis').health = 0;
  let view = jumpToStage(withSis, 'rescue', 0);
  assert.equal(option(view, 'radio').disabled, true);
  assert.equal(option(view, 'sis').disabled, false);

  const alone = homeGame({ seed: 23, bring: [], stock: { food: 99, water: 99, battery: 1 } });
  view = jumpToStage(alone, 'rescue', 0);
  assert.equal(option(view, 'radio').disabled, true);
  assert.equal(option(view, 'sis').disabled, true);
  alone.chooseOption('ignore');
  assert.equal(alone.director.chains.rescue.status, 'scheduled', '방송은 다시 들린다');
  assert.equal(alone.pathsView().find((p) => p.id === 'rescue').status, 'missed');
});

test('강변 거점: 아빠가 교섭하면 조건이 낮아지고, 합류 날 물자가 모자라면 이길 수 없다', () => {
  const withDad = homeGame({ seed: 24, bring: ['dad'], stock: { food: 99, water: 99 } });
  jumpToStage(withDad, 'group', 0);
  withDad.chooseOption('dad');
  assert.deepEqual([withDad.director.chains.group.data.food, withDad.director.chains.group.data.water], [3, 3]);

  const noDad = homeGame({ seed: 24, bring: ['mom'], stock: { food: 99, water: 99 } });
  let view = jumpToStage(noDad, 'group', 0);
  assert.equal(option(view, 'dad').disabled, true);
  noDad.chooseOption('talk');
  const chain = noDad.director.chains.group;
  assert.deepEqual([chain.data.food, chain.data.water], [4, 4]);
  const path = noDad.pathsView().find((p) => p.id === 'group');
  assert.equal(path.status, 'open');
  assert.match(path.schedule, /일차/);
  assert.ok(path.requirements.some((r) => r.text.startsWith('식량') && r.need === 4));

  view = jumpToStage(noDad, 'group', 2);
  noDad.stock.food = 2;
  noDad.stock.water = 9;
  view = noDad.eventView();
  assert.equal(option(view, 'pay').disabled, true);
  noDad.chooseOption('delay');
  assert.equal(noDad.ending, null);
  noDad.endDay();
  resolveAnyEvent(noDad);
  noDad.endDay();
  assert.equal(noDad.event.defId, 'group_join', '이틀 뒤 마지막으로 다시 온다');
  noDad.stock.food = 4; // 그 사이 식구가 먹은 몫과 별도로 합류 몫을 남겨 둔 상황
  assert.equal(option(noDad.eventView(), 'pay').disabled, false);
  noDad.chooseOption('pay');
  assert.equal(noDad.ending.id, 'group');
  assert.equal(noDad.ending.type, 'victory');
});

test('승합차: 연료통 2개와 도로 지도가 모일 때까지 출발 점검이 계속 돌아온다', () => {
  const game = homeGame({ seed: 25, stock: { food: 99, water: 99, fuel: 1 } });
  const view = jumpToStage(game, 'car', 2);
  assert.equal(option(view, 'go').disabled, true);
  for (let i = 0; i < 3; i++) {
    game.chooseOption('wait');
    const due = game.director.chains.car.due;
    while (game.day < due) {
      resolveAnyEvent(game);
      game.endDay();
    }
    assert.equal(game.event.defId, 'car_depart', '다음 점검일에 반드시 다시 온다');
  }
  game.stock.fuel = 2;
  game.stock.map = 1;
  game.chooseOption('go');
  assert.equal(game.ending.id, 'car');
});

test('탈출 계획 화면에는 열린 경로와 다음 할 일이 나온다', () => {
  const game = homeGame({ seed: 26, stock: { food: 99, water: 99, battery: 2, radio: 1 } });
  assert.ok(game.pathsView().every((p) => p.status === 'hidden'));
  jumpToStage(game, 'rescue', 0);
  game.chooseOption('radio');
  const rescue = game.pathsView().find((p) => p.id === 'rescue');
  assert.equal(rescue.status, 'open');
  assert.equal(rescue.steps[0].done, true);
  assert.match(rescue.schedule, /다음 교신: \d+일차/);
  assert.match(rescue.next, /신호탄/);
  assert.ok(rescue.requirements.find((r) => r.text === '신호탄' && r.have === 0 && r.need === 1));
});
