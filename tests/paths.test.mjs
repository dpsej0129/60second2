import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PATHS } from '../src/core/events/index.js';
import { Game } from '../src/core/game.js';
import { SERVINGS } from '../src/core/items.js';
import { homeGame, jumpToStage, resolveAnyEvent } from './helpers/setup.mjs';
import { chooseOption, playGame, talkTarget, treat } from './helpers/strategy.mjs';

const option = (view, id) => view.options.find((o) => o.id === id);

for (const target of ['rescue', 'group', 'car', 'safezone', 'caravan']) {
  test(`승리 경로 「${target}」: 60초 탐색 → 사건 → 반복 탐사 → 결말까지 실제로 도달한다`, () => {
    // 탐사에서 가족을 잃는 등 운이 나쁘면 질 수도 있다. 그래도 대부분은 그 경로로 이긴다.
    let wins = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = playGame(new Game({ seed, zombies: false, difficulty: 'easy' }), { target, maxDays: 100 });
      assert.equal(game.phase, 'ending', `seed ${seed}: 결말에 도달한다`);
      if (game.ending.type !== 'victory') continue;
      assert.equal(game.ending.id, target, `seed ${seed}: 다른 경로로 이기지 않는다`);
      assert.ok(game.expeditions >= 2, '탐사를 여러 번 보냈다');
      assert.ok(game.day >= 30, `seed ${seed}: 한 달은 넘게 버텨야 탈출할 수 있다 (${game.day}일차)`);
      assert.equal(game.pathsView().find((p) => p.id === target).status, 'done');
      wins += 1;
    }
    assert.ok(wins >= 4, `5게임 중 ${wins}승`);
  });
}

test('경로를 모두 거절하면, 물자가 넉넉해 100일을 버텨도 승리하지 못한다', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const game = homeGame({ seed, bonus: true, stock: { food: 999, water: 999, med: 99 } });
    while (game.phase === 'home' && game.day <= 100) {
      for (let i = 0; i < 4 && game.phase === 'home' && game.event && !game.event.resolved; i++) {
        game.chooseOption(chooseOption(game, 'none'));
      }
      if (game.phase !== 'home') break;
      game.endDay();
    }
    assert.notEqual(game.ending?.type, 'victory', `seed ${seed}`);
    assert.ok(game.day > 100 || game.ending, '100일을 넘겼다');
  }
});

test('탈출 경로가 모두 닫히면 며칠 뒤 하나가 다시 열려, 이길 길이 영영 사라지지는 않는다', () => {
  const game = homeGame({ seed: 31, stock: { food: 999, water: 999, med: 99 } });
  const paths = PATHS.map((def) => game.director.chains[def.id]);
  let closedOn = null;
  let reopenedOn = null;
  while (game.phase === 'home' && game.day <= 160 && reopenedOn == null) {
    if (closedOn == null && paths.every((c) => c.status === 'failed')) closedOn = game.day;
    for (let i = 0; i < 4 && game.phase === 'home' && game.event && !game.event.resolved; i++) {
      game.chooseOption(chooseOption(game, 'none'));
    }
    if (game.phase !== 'home') break;
    // 식구를 돌보며 버틴다(마음이 무너져 떠나거나, 혼자 남아 무너지지 않게)
    const listener = talkTarget(game);
    if (listener) game.talk(listener);
    treat(game, 'none');
    game.endDay();
    if (closedOn != null && paths.some((c) => c.status !== 'failed')) reopenedOn = game.day;
  }
  assert.ok(closedOn != null, '모두 거절하면 다섯 경로가 다 닫힌다');
  assert.ok(reopenedOn != null, '그 뒤 경로 하나가 다시 열린다');
  assert.ok(reopenedOn - closedOn >= 8 && reopenedOn - closedOn <= 16, `${closedOn}일차에 닫히고 ${reopenedOn}일차에 다시 열림`);
  const revived = paths.find((c) => c.status !== 'failed');
  assert.equal(game.event?.chainId, revived.id, '다시 열린 경로의 첫 사건이 그날 일어난다');
  assert.equal(revived.stage, 0);
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
  assert.equal(chain.due, game.day + 3, '구조대가 알려 준 날(사흘 뒤) 다시 온다');
  assert.match(game.pathsView().find((p) => p.id === 'rescue').next, /마지막 기회/);

  // 다시 온 날에도 신호탄이 없으면 닫힌다
  game.endDay();
  resolveAnyEvent(game);
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
  assert.deepEqual([withDad.director.chains.group.data.food, withDad.director.chains.group.data.water], [2 * SERVINGS, 2 * SERVINGS], '통조림 2캔·물 2병');

  const noDad = homeGame({ seed: 24, bring: ['mom'], stock: { food: 99, water: 99 } });
  let view = jumpToStage(noDad, 'group', 0);
  assert.equal(option(view, 'dad').disabled, true);
  noDad.chooseOption('talk');
  const chain = noDad.director.chains.group;
  assert.deepEqual([chain.data.food, chain.data.water], [3 * SERVINGS, 3 * SERVINGS], '통조림 3캔·물 3병');
  const path = noDad.pathsView().find((p) => p.id === 'group');
  assert.equal(path.status, 'open');
  assert.match(path.schedule, /일차/);
  assert.ok(path.requirements.some((r) => r.text.startsWith('식량') && r.need === 3 * SERVINGS));

  view = jumpToStage(noDad, 'group', 2);
  noDad.stock.food = 2 * SERVINGS;
  noDad.stock.water = 9 * SERVINGS;
  view = noDad.eventView();
  assert.equal(option(view, 'pay').disabled, true);
  noDad.chooseOption('delay');
  assert.equal(noDad.ending, null);
  for (let i = 0; i < 3; i++) {
    resolveAnyEvent(noDad);
    noDad.endDay();
  }
  assert.equal(noDad.event.defId, 'group_join', '사흘 뒤 마지막으로 다시 온다');
  noDad.stock.food = 3 * SERVINGS; // 그 사이 식구가 먹은 몫과 별도로 합류 몫을 남겨 둔 상황
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
    for (let d = 0; d < 30 && game.phase === 'home' && game.day < due; d++) {
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

test('경로 안내는 아직 모자란 것만 알려 주고, 놓친 기회의 남은 횟수를 정확히 센다', () => {
  const game = homeGame({ seed: 27, stock: { food: 99, water: 99, battery: 3, radio: 1, flare: 1 } });
  jumpToStage(game, 'rescue', 0);
  game.chooseOption('radio');
  let rescue = game.pathsView().find((p) => p.id === 'rescue');
  assert.doesNotMatch(rescue.next, /신호탄을 구해/, '신호탄이 이미 있으면 구하라고 하지 않는다');
  assert.match(rescue.next, /준비는 끝났다/);
  game.stock.flare = 0;
  rescue = game.pathsView().find((p) => p.id === 'rescue');
  assert.match(rescue.next, /신호탄을 구해/);

  const g2 = homeGame({ seed: 28, stock: { food: 99, water: 99 } });
  jumpToStage(g2, 'group', 0);
  g2.chooseOption('refuse');
  assert.equal(g2.director.chains.group.status, 'scheduled');
  assert.match(g2.pathsView().find((p) => p.id === 'group').next, /한 번 더 찾아오지만, 그때가 마지막/);
  jumpToStage(g2, 'rescue', 0);
  g2.chooseOption('ignore');
  assert.match(g2.pathsView().find((p) => p.id === 'rescue').next, /남은 기회 2번/);
});

test('첫 사건이 진행 중일 때는 아직 놓친 기회로 표시하지 않는다', () => {
  const game = homeGame({ seed: 29, stock: { food: 99, water: 99 } });
  jumpToStage(game, 'group', 0);
  assert.equal(game.pathsView().find((p) => p.id === 'group').status, 'hidden');
  game.chooseOption('refuse');
  assert.equal(game.pathsView().find((p) => p.id === 'group').status, 'missed');
});
