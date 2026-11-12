// 여러 결말: 새 탈출 경로(남쪽 안전지대·상인 캐러밴), 기묘한 결말(하얀 정원), 나쁜 결말(빼앗긴 집·홀로 남은 집), 후일담
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENDING_ORDER, ENDINGS, epilogue } from '../src/core/endings.js';
import { SERVINGS } from '../src/core/items.js';
import { homeGame, jumpToStage, resolveAnyEvent, stageEvent } from './helpers/setup.mjs';

const option = (view, id) => view.options.find((o) => o.id === id);

test('결말은 탈출 6가지, 기묘한 결말 2가지, 패배 8가지다', () => {
  const byType = (type) => ENDING_ORDER.filter((id) => ENDINGS[id].type === type);
  assert.deepEqual(byType('victory'), ['rescue', 'group', 'car', 'safezone', 'caravan', 'train']);
  assert.deepEqual(byType('odd'), ['cult', 'radio']);
  assert.deepEqual(byType('defeat').sort(), ['caught', 'died', 'fire', 'horde', 'lost', 'madness', 'raiders', 'timeout']);
  assert.equal(new Set(ENDING_ORDER.map((id) => ENDINGS[id].icon)).size, ENDING_ORDER.length, '결말마다 아이콘이 다르다');
  for (const id of ENDING_ORDER) assert.ok(ENDINGS[id].icon && ENDINGS[id].title && ENDINGS[id].text, id);
});

test('남쪽 안전지대: 한 사람마다 통조림 1캔·물 1병을 챙겨야 하고, 걷지 못하는 사람이 있으면 떠날 수 없다', () => {
  const game = homeGame({ seed: 41, stock: { food: 99, water: 99 } });
  let view = jumpToStage(game, 'safezone', 0);
  assert.equal(option(view, 'ask').disabled, false);
  game.chooseOption('listen');
  assert.equal(game.director.chains.safezone.opened, true);

  const g2 = homeGame({ seed: 42, bring: ['dad', 'sis'], stock: { food: 99, water: 99 } });
  view = jumpToStage(g2, 'safezone', 1);
  assert.equal(option(view, 'map').disabled, true, '지도가 없으면 지도로 길을 짤 수 없다');
  assert.equal(option(view, 'dad').disabled, false);
  g2.chooseOption('dad');
  assert.equal(g2.director.chains.safezone.stage, 2);

  view = jumpToStage(g2, 'safezone', 2);
  g2.person('sis').health = 2;
  assert.match(option(g2.eventView(), 'go').reason, /걷지 못하는 사람이 있다 \(동생\)/);
  g2.person('sis').health = 0;
  g2.stock.food = 3 * SERVINGS - 1; // 세 사람에 한 끼 모자람
  assert.match(option(g2.eventView(), 'go').reason, /통조림/);
  g2.stock.food = 3 * SERVINGS;
  g2.stock.water = 3 * SERVINGS;
  g2.chooseOption('go');
  assert.equal(g2.ending.id, 'safezone');
  assert.equal(g2.ending.type, 'victory');
  assert.deepEqual([g2.stock.food, g2.stock.water], [0, 0], '배낭에 다 나눠 담았다');
  const lines = epilogue(g2);
  assert.match(lines.find((l) => l.id === 'dad').text, /피난 행렬의 맨 앞/);
  assert.match(lines.find((l) => l.id === 'mom').text, /60초 안에 데려오지 못했다/);
});

test('떠돌이 상인 캐러밴: 쓸모를 보여 주고(동생·공구 상자·연료통), 자리값 건전지 2개와 물 1병을 내야 한다', () => {
  const game = homeGame({ seed: 43, bring: ['dad'], stock: { food: 99, water: 99, fuel: 1 } });
  let view = jumpToStage(game, 'caravan', 1);
  assert.equal(option(view, 'sis').disabled, true, '동생이 없다');
  assert.equal(option(view, 'toolkit').disabled, true);
  assert.equal(option(view, 'fuel').disabled, false);
  game.chooseOption('fuel');
  assert.equal(game.stock.fuel, 0);

  view = jumpToStage(game, 'caravan', 2);
  game.stock.battery = 1;
  assert.match(option(game.eventView(), 'go').reason, /건전지/);
  game.chooseOption('wait');
  assert.equal(game.director.chains.caravan.status, 'scheduled', '다음 바퀴에 다시 온다');

  jumpToStage(game, 'caravan', 2);
  game.stock.battery = 2;
  const water = game.stock.water;
  game.chooseOption('go');
  assert.equal(game.ending.id, 'caravan');
  assert.equal(game.stock.water, water - SERVINGS, '물 1병');

  // 도울 방법이 없으면 한 번 더 들르고, 그다음엔 떠난다
  const g2 = homeGame({ seed: 44, bring: [], stock: { food: 99, water: 99 } });
  jumpToStage(g2, 'caravan', 1);
  g2.chooseOption('none');
  assert.equal(g2.director.chains.caravan.status, 'scheduled');
  jumpToStage(g2, 'caravan', 1);
  g2.chooseOption('none');
  assert.equal(g2.director.chains.caravan.status, 'failed');
});

test('하얀 옷의 사람들: 세 번째로 찾아와야 따라갈 수 있고, 따라가면 이긴 것도 진 것도 아닌 결말', () => {
  const game = homeGame({ seed: 45, stock: { food: 40, water: 40 } });
  let view = stageEvent(game, 'white_robes');
  assert.equal(option(view, 'join').disabled, true, '처음엔 따라갈 수 없다');
  game.chooseOption('wave');
  view = stageEvent(game, 'white_robes');
  assert.match(view.text, /정원에서는 아무도 굶지 않습니다/);
  const water = game.stock.water;
  game.chooseOption('wave');
  assert.equal(game.stock.water, water + SERVINGS, '두고 간 물 한 병');
  assert.equal(game.sendExpedition({ memberId: 'sis' }), true);
  view = stageEvent(game, 'white_robes');
  assert.equal(option(view, 'join').disabled, false);
  assert.equal(option(view, 'wave').disabled, true);
  game.chooseOption('join');
  assert.equal(game.ending.id, 'cult');
  assert.equal(game.ending.type, 'odd');
  assert.match(game.ending.text, /탐사를 나간 동생을 기다릴 수 없었다/);
  const lines = epilogue(game);
  assert.match(lines.find((l) => l.id === 'dad').text, /하얀 옷/);
  assert.match(lines.find((l) => l.id === 'sis').text, /탐사에서 돌아오기 전에 떠나야 했다/);

  // 세 번째에 거절하면 다시 오지 않는다
  const g2 = homeGame({ seed: 46 });
  for (let i = 0; i < 2; i++) {
    stageEvent(g2, 'white_robes');
    g2.chooseOption('refuse');
  }
  stageEvent(g2, 'white_robes');
  g2.chooseOption('refuse');
  assert.equal(g2.flags.robesGone, true);
  assert.equal(g2.ending, null);
});

test('약탈자 무리: 쪽지를 두 번 무시하면 쳐들어오고, 달아나거나 내줄 것이 없으면 집을 빼앗긴다', () => {
  const game = homeGame({ seed: 47, bring: ['mom'], stock: { food: 8, water: 8 } });
  let view = stageEvent(game, 'gang_note');
  assert.equal(option(view, 'ambush').disabled, true, '아빠가 없으면 숨어서 기다릴 수 없다');
  game.chooseOption('ignore');
  view = stageEvent(game, 'gang_note');
  assert.match(view.text, /마지막 경고/);
  game.chooseOption('ignore');
  assert.equal(game.flags.gangAnger, 2);
  assert.ok(game.director.randomEvents.find((e) => e.id === 'gang_raid').when(game), '이제 쳐들어올 수 있다');
  assert.equal(game.director.randomEvents.find((e) => e.id === 'gang_note').when(game), false, '쪽지는 더 오지 않는다');

  stageEvent(game, 'gang_raid');
  game.chooseOption('give');
  assert.deepEqual([game.stock.food, game.stock.water], [4, 4], '식량·물 절반을 빼앗긴다');
  assert.equal(game.ending, null);
  assert.equal(game.flags.gangAnger, 0, '빼앗아 간 뒤 다시 쪽지부터 시작한다');

  game.stock.food = 0;
  game.stock.water = 0;
  stageEvent(game, 'gang_raid');
  game.chooseOption('give');
  assert.equal(game.ending.id, 'raiders', '내줄 것이 없으면 쫓겨난다');
  assert.equal(game.ending.type, 'defeat');

  const g2 = homeGame({ seed: 48 });
  stageEvent(g2, 'gang_raid');
  g2.chooseOption('flee');
  assert.equal(g2.ending.id, 'raiders');

  // 아빠와 방망이가 있으면 대개 쫓아낸다
  let driven = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = homeGame({ seed, stock: { food: 20, water: 20, weapon: 1 } });
    stageEvent(g, 'gang_raid');
    g.chooseOption('fight');
    if (g.flags.gangGone) driven += 1;
  }
  assert.ok(driven >= 12, `20번 중 ${driven}번 쫓아냄`);
});

test('홀로 남은 집: 혼자 남은 채 오래 지내면 마음이 무너지고, 식구가 있으면 그렇지 않다', () => {
  let maddened = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const game = homeGame({ seed, bring: [], stock: { food: 400, water: 400 } });
    game.director.randomEvents = [];
    for (let d = 0; d < 80 && game.phase === 'home'; d++) {
      resolveAnyEvent(game);
      if (game.phase !== 'home') break;
      game.setAllRations(true);
      game.endDay();
      if (d === 1) assert.equal(game.me.mood, 0, '처음 며칠은 버틴다');
    }
    if (game.ending?.id === 'madness') {
      maddened += 1;
      assert.ok(game.ending.day >= 8, `${game.ending.day}일차`);
      assert.ok(game.log.some((e) => /벽에 가족의 얼굴을 그렸다/.test(e.text)), '일지에 무너져 가는 모습이 적힌다');
    }
  }
  assert.ok(maddened >= 8, `혼자 80일: 10판 중 ${maddened}판`);

  const together = homeGame({ seed: 3, stock: { food: 400, water: 400 } });
  together.director.randomEvents = [];
  for (let d = 0; d < 80 && together.phase === 'home'; d++) {
    resolveAnyEvent(together);
    if (together.phase !== 'home') break;
    together.setAllRations(true);
    for (const p of together.presentPeople()) together.talk(p.id);
    together.endDay();
  }
  assert.equal(together.me.mood, 0, '식구와 함께면 주인공의 마음은 흔들리지 않는다');
  assert.notEqual(together.ending?.id, 'madness');
});

test('후일담: 먼저 떠나보낸 식구는 사연과 함께 남는다', () => {
  const game = homeGame({ seed: 49, bring: ['dad', 'sis'], stock: { food: 0, water: 40 } });
  game.director.randomEvents = [];
  game.person('sis').hunger = 6;
  game.setAllRations(true);
  game.endDay();
  assert.equal(game.person('sis').status, 'dead');
  game.setEnding('rescue');
  const lines = epilogue(game);
  assert.deepEqual(
    lines.map((l) => [l.name, l.text]),
    [
      ['아빠', '피난민 캠프에서 경비대에 자원했다.'],
      ['엄마', '60초 안에 데려오지 못했다.'],
      ['동생', '굶주림으로 세상을 떠났다.'],
    ],
  );
});

test('마지막 피난 열차: 검역에서 상처가 있는 사람은 탈 수 없다. 치료하거나, 두고 가거나, 다음 열차를 기다린다', () => {
  const game = homeGame({ seed: 61, stock: { food: 99, water: 99, med: 3 } });
  let view = jumpToStage(game, 'train', 0);
  assert.equal(option(view, 'radio').disabled, true, '무전기가 없다');
  assert.equal(option(view, 'dad').disabled, false);
  game.chooseOption('dad');
  assert.equal(game.director.chains.train.stage, 1);

  view = jumpToStage(game, 'train', 2);
  const sis = game.person('sis');
  sis.health = 1;
  game.me.health = 0;
  game.person('dad').health = 0;
  assert.match(option(game.eventView(), 'board').reason, /상처가 있는 사람이 있다 \(동생\)/);
  assert.equal(option(game.eventView(), 'board_leave').disabled, false);
  game.chooseOption('wait');
  assert.equal(game.director.chains.train.status, 'scheduled', '다음 열차가 온다');

  jumpToStage(game, 'train', 2);
  for (const p of game.presentPeople()) p.health = 0;
  game.chooseOption('board');
  assert.equal(game.ending.id, 'train');
  assert.equal(game.ending.type, 'victory');
  assert.match(epilogue(game).find((l) => l.id === 'mom').text, /객차를 돌며/);

  // 다친 식구를 두고 떠나면 승강장에 남는다
  const g2 = homeGame({ seed: 62, bring: ['dad', 'sis'], stock: { food: 99, water: 99 } });
  jumpToStage(g2, 'train', 2);
  for (const p of g2.presentPeople()) p.health = 0;
  g2.person('sis').health = 1;
  g2.chooseOption('board_leave');
  assert.equal(g2.ending.id, 'train');
  assert.match(g2.ending.text, /승강장에 남겨진 동생/);
  assert.match(epilogue(g2).find((l) => l.id === 'sis').text, /검역을 통과하지 못해/);
});

test('좀비 FM의 새 목소리: 비밀 창고를 찾아낸 뒤 DJ의 마지막 방송이 오면 방송국을 이어받을 수 있다', () => {
  const game = homeGame({ seed: 63, stock: { food: 40, water: 40, radio: 1 } });
  const station = game.director.randomEvents.find((e) => e.id === 'dj_station');
  assert.equal(station.when(game), false, 'DJ 미션을 끝내기 전에는 오지 않는다');
  game.director.chains.dj.status = 'done';
  assert.equal(station.when(game), true);
  stageEvent(game, 'dj_station');
  game.chooseOption('take');
  assert.equal(game.ending.id, 'radio');
  assert.equal(game.ending.type, 'odd');
  assert.match(epilogue(game).find((l) => l.id === 'sis').text, /송신기/);
});

test('불길: 물 2병이나 아빠로 끌 수 있고, 맨손이면 집을 잃을 수도 있다', () => {
  const game = homeGame({ seed: 64, stock: { food: 40, water: 40 } });
  let view = stageEvent(game, 'fire');
  game.chooseOption('water');
  assert.equal(game.stock.water, 40 - 2 * SERVINGS);
  assert.equal(game.ending, null);

  const flee = homeGame({ seed: 65 });
  stageEvent(flee, 'fire');
  flee.chooseOption('flee');
  assert.equal(flee.ending.id, 'fire');

  let burned = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = homeGame({ seed, bring: [], stock: { water: 0 } });
    view = stageEvent(g, 'fire');
    assert.equal(option(view, 'water').disabled, true);
    g.chooseOption('me');
    if (g.ending?.id === 'fire') burned += 1;
  }
  assert.ok(burned >= 3 && burned <= 18, `맨손으로 40번 중 ${burned}번 집을 잃음`);
});

test('좀비 떼: 미리 문을 막아 두면 무사히 지나가고, 아무것도 안 하면 문이 무너질 수 있다', () => {
  const game = homeGame({ seed: 66, stock: { food: 40, water: 40, toolkit: 1 } });
  stageEvent(game, 'horde_warning');
  game.chooseOption('toolkit');
  assert.equal(game.flags.barricade, true);
  assert.ok(game.flags.hordeDay >= game.day + 2 && game.flags.hordeDay <= game.day + 4);
  const horde = game.director.randomEvents.find((e) => e.id === 'horde');
  assert.equal(horde.when(game), false, '그날이 오기 전에는 오지 않는다');
  game.day = game.flags.hordeDay;
  assert.equal(horde.when(game), true);
  stageEvent(game, 'horde');
  game.chooseOption('hold');
  assert.equal(game.ending, null, '판자가 버텼다');
  assert.equal(game.flags.hordeDay, null);

  let broken = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = homeGame({ seed, bring: [], stock: { food: 20 } });
    stageEvent(g, 'horde_warning');
    g.chooseOption('pray');
    stageEvent(g, 'horde');
    g.chooseOption('hold');
    if (g.ending?.id === 'horde') broken += 1;
  }
  assert.ok(broken >= 4 && broken <= 22, `막지 않고 40번 중 ${broken}번 문이 무너짐`);
});
