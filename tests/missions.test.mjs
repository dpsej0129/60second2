import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MISSION_EVENTS, MISSIONS, QUIZ, quizAnswerId } from '../src/core/events/missions.js';
import { Game } from '../src/core/game.js';
import { homeGame, isolate, resolveAnyEvent, stageEvent, untilChainEvent } from './helpers/setup.mjs';
import { playGame } from './helpers/strategy.mjs';

const option = (view, id) => view.options.find((o) => o.id === id);
const total = (stock) => Object.values(stock).reduce((a, b) => a + b, 0);
const mission = (game, id) => game.missionsView().find((m) => m.id === id);

test('떠돌이 개 보리: 들이면 습격·약탈 사건의 선택지가 늘고, 밥을 못 주면 떠난다', () => {
  const game = isolate(homeGame({ seed: 51, stock: { food: 40, water: 40 } }));
  assert.equal(option(stageEvent(game, 'raid'), 'dog').disabled, true, '보리가 없으면 고를 수 없다');
  stageEvent(game, 'dog_stray');
  game.chooseOption('adopt');
  assert.equal(game.stock.food, 38, '통조림 ½캔');
  assert.equal(game.flags.dog, true);
  assert.equal(mission(game, 'dog').status, 'active');
  assert.equal(option(stageEvent(game, 'raid'), 'dog').disabled, false);
  assert.equal(option(stageEvent(game, 'looters'), 'dog').disabled, false);
  assert.equal(option(stageEvent(game, 'mystery_cans'), 'dog').disabled, false);
  game.event = null;

  // 며칠 뒤 보리가 상자를 찾아낸다
  let view = untilChainEvent(game, 'dog');
  assert.equal(view.id, 'dog_dig');
  const before = total(game.stock);
  game.chooseOption('dig');
  assert.ok(total(game.stock) >= before + 2, '물품 2개를 얻는다');

  // 그 뒤로는 며칠마다 밥을 줘야 한다
  view = untilChainEvent(game, 'dog');
  assert.equal(view.id, 'dog_hungry');
  const food = game.stock.food;
  game.chooseOption('feed');
  assert.equal(game.stock.food, food - 1);
  assert.equal(game.flags.dog, true);
  assert.match(mission(game, 'dog').schedule, /다음 밥 줄 날: \d+일차/);

  view = untilChainEvent(game, 'dog');
  assert.equal(view.id, 'dog_hungry', '밥 줄 날이 다시 돌아온다');
  game.chooseOption('none');
  assert.equal(game.flags.dog, false);
  assert.equal(mission(game, 'dog').status, 'failed');
  assert.equal(option(stageEvent(game, 'raid'), 'dog').disabled, true);
});

test('옥상 감자밭: 심고, 돌보고, 수확한다. 한 번은 다시 심을 수 있다', () => {
  const game = isolate(homeGame({ seed: 52, stock: { food: 40, water: 40 } }));
  stageEvent(game, 'garden_find');
  game.chooseOption('plant');
  assert.equal(game.stock.water, 38, '물 ½병');
  assert.match(mission(game, 'garden').schedule, /싹 확인: \d+일차/);

  let view = untilChainEvent(game, 'garden');
  assert.equal(view.id, 'garden_sprout');
  game.chooseOption('scarecrow'); // 아빠가 허수아비를 세운다 → 수확 +2
  view = untilChainEvent(game, 'garden');
  assert.equal(view.id, 'garden_harvest');
  assert.match(view.text, /4알쯤/);
  const food = game.stock.food;
  game.chooseOption('replant');
  assert.equal(game.stock.food, food + 3, '하나를 남기고 3알 수확');

  view = untilChainEvent(game, 'garden');
  assert.equal(view.id, 'garden_sprout', '다시 싹이 튼다');
  game.chooseOption('leave');
  view = untilChainEvent(game, 'garden');
  assert.equal(option(view, 'replant').disabled, true, '두 번째에는 다시 심을 수 없다');
  const food2 = game.stock.food;
  game.chooseOption('harvest');
  assert.equal(game.stock.food, food2 + 2, '돌보지 않으면 2알');
  assert.equal(mission(game, 'garden').status, 'done');
});

test('좀비 FM 퀴즈: 정답을 맞혀야 비밀 창고 미션이 열린다', () => {
  for (let quiz = 0; quiz < QUIZ.length; quiz++) {
    const game = isolate(homeGame({ seed: 53 + quiz, stock: { food: 40, water: 40, battery: 2, radio: 1 } }));
    const answer = quizAnswerId({ quiz });
    const wrong = ['a', 'b', 'c'].find((id) => id !== answer);

    let view = stageEvent(game, 'dj_quiz', { quiz });
    assert.match(view.text, new RegExp(QUIZ[quiz].q.slice(0, 8)));
    assert.match(option(view, 'a').label, new RegExp(QUIZ[quiz].options[0]));
    game.chooseOption(wrong);
    assert.equal(game.stock.battery, 1);
    assert.equal(mission(game, 'dj'), undefined, '틀리면 미션이 열리지 않는다');

    stageEvent(game, 'dj_quiz', { quiz });
    game.chooseOption(answer);
    assert.equal(game.stock.battery, 0);
    assert.equal(mission(game, 'dj').status, 'active');

    view = stageEvent(game, 'dj_quiz', { quiz });
    assert.equal(option(view, 'a').disabled, true, '건전지가 없으면 답을 보낼 수 없다');
    game.chooseOption('skip');

    view = untilChainEvent(game, 'dj');
    assert.equal(view.id, 'dj_cache');
    const before = total(game.stock);
    game.chooseOption('dad');
    assert.ok(total(game.stock) >= before + 3, '금고에서 물품 3개');
    assert.equal(mission(game, 'dj').status, 'done');
  }
});

test('내기꾼과 가위바위보: 이기면 통조림 1캔, 지면 ½캔을 잃고, 비기면 그대로', () => {
  const results = { win: 0, lose: 0, tie: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const game = homeGame({ seed, stock: { food: 8, water: 8 } });
    const view = stageEvent(game, 'gambler');
    assert.equal(view.options.length, 4);
    game.chooseOption(['scissors', 'rock', 'paper'][seed % 3]);
    const diff = game.stock.food - 8;
    assert.ok([4, 0, -2].includes(diff), `식량 변화 ${diff}`);
    results[diff === 4 ? 'win' : diff === 0 ? 'tie' : 'lose'] += 1;
    assert.match(game.event.outcome, /가위, 바위, 보!/);
  }
  assert.ok(results.win > 8 && results.lose > 8 && results.tie > 8, JSON.stringify(results));
  const broke = homeGame({ seed: 2, stock: { food: 1 } });
  assert.equal(option(stageEvent(broke, 'gambler'), 'rock').disabled, true, '걸 식량이 없으면 할 수 없다');
});

test('보급 상자·자판기·상표 없는 통조림: 가진 것에 따라 방법이 달라진다', () => {
  const game = homeGame({ seed: 61, stock: { food: 5, water: 5, flare: 1 } });
  let view = stageEvent(game, 'airdrop');
  let before = total(game.stock);
  game.chooseOption('flare');
  assert.equal(game.stock.flare >= 0, true);
  assert.ok(total(game.stock) >= before - 1 + 4, '신호탄 1개를 쓰고 물품 4개를 얻는다');

  view = stageEvent(game, 'airdrop');
  assert.equal(option(view, 'flare').disabled, game.stock.flare < 1);
  before = total(game.stock);
  game.chooseOption('me');
  assert.ok(total(game.stock) >= before + 3);

  view = stageEvent(game, 'vending');
  assert.equal(option(view, 'toolkit').disabled, game.stock.toolkit < 1);
  assert.equal(option(view, 'coin').disabled, false);
  game.stock.toolkit = 1;
  const water = game.stock.water;
  stageEvent(game, 'vending');
  game.chooseOption('toolkit');
  assert.equal(game.stock.water, water + 8, '물 2병');

  view = stageEvent(game, 'mystery_cans');
  assert.equal(option(view, 'dog').disabled, true);
  game.flags.dog = true;
  const food = game.stock.food;
  stageEvent(game, 'mystery_cans');
  game.chooseOption('dog');
  assert.equal(game.stock.food, food + 8, '보리가 상한 캔을 가려내고 2캔을 챙긴다');
});

test('옆집 할머니: 도와드리면 보답이 오고, 통조림을 돌려드리면 탐사가 더 안전해진다', () => {
  const game = isolate(homeGame({ seed: 62, stock: { food: 40, water: 40, med: 1 } }));
  stageEvent(game, 'granny_knock');
  game.chooseOption('med');
  assert.equal(game.stock.med, 0);
  const view = untilChainEvent(game, 'granny');
  assert.equal(view.id, 'granny_gift');
  const risk = game.expeditionRisk('mom').lost;
  const food = game.stock.food;
  game.chooseOption('share');
  assert.equal(game.stock.food, food + 4, '통조림 1캔');
  assert.equal(game.stock.map, 1, '도로 지도를 받는다');
  assert.equal(game.flags.shortcut, true);
  assert.ok(game.expeditionRisk('mom').lost < risk, '탐사 위험이 줄어든다');
  assert.equal(mission(game, 'granny').status, 'done');

  const g2 = isolate(homeGame({ seed: 63, stock: { food: 40, water: 40, map: 1 } }));
  stageEvent(g2, 'granny_knock');
  assert.equal(option(g2.eventView(), 'med').disabled, true);
  g2.chooseOption('mom'); // 구급약이 없어도 엄마가 돌봐 드릴 수 있다
  untilChainEvent(g2, 'granny');
  g2.chooseOption('accept');
  assert.equal(g2.stock.flare, 1, '지도가 이미 있으면 신호탄을 받는다');
  assert.equal(g2.flags.shortcut, false);
});

test('미션 사건은 저마다 무작위 사건으로 등록되어 있고, 여러 날 이어지는 미션은 수락해야 시작된다', () => {
  assert.ok(MISSION_EVENTS.length >= 8, `미션 사건 ${MISSION_EVENTS.length}개`);
  assert.deepEqual(MISSIONS.map((m) => m.id).sort(), ['dj', 'dog', 'garden', 'granny']);
  const game = homeGame({ seed: 64 });
  for (const m of MISSIONS) assert.equal(game.director.chains[m.id].status, 'idle');
  assert.deepEqual(game.missionsView(), [], '아직 시작한 미션이 없다');
  resolveAnyEvent(game);
});

test('실제 플레이에서 미션이 한 판에 여러 번 나온다', () => {
  const ids = new Set([...MISSION_EVENTS.map((e) => e.id), ...MISSIONS.flatMap((m) => m.stages.map((s) => s.id))]);
  let count = 0;
  const seen = new Set();
  const games = 30;
  for (let seed = 1; seed <= games; seed++) {
    const game = playGame(new Game({ seed, zombies: false, difficulty: 'easy' }), { target: 'car', maxDays: 30 });
    for (const h of game.director.history) {
      if (!ids.has(h.defId)) continue;
      count += 1;
      seen.add(h.defId);
    }
  }
  assert.ok(count / games >= 3, `한 판 평균 ${(count / games).toFixed(1)}번`);
  assert.ok(seen.size >= 10, `30판 동안 나온 미션 사건 종류 ${seen.size}가지`);
});
