// 게임 전체를 대신 플레이하는 전략(검증 도구). 목표 승리 경로(target)를 정하면
// 그 경로의 사건은 수락하고 나머지 경로는 거절하며, 필요한 물자를 탐사로 구해 온다.
//   target: 'rescue' | 'group' | 'car' | 'safezone' | 'caravan' | 'train' | 'all'(모든 경로 수락) | 'none'(모든 경로 거절)
import { HUNGER_DEATH, HUNGER_NOTICE, SIM_STEP, THIRST_DEATH, THIRST_NOTICE } from '../../src/core/constants.js';
import { quizAnswerId } from '../../src/core/events/missions.js';
import { SERVINGS } from '../../src/core/items.js';
import { RunBot, scramblePlan } from './bot.mjs';

const CHAIN_PREFS = {
  rescue_call: { go: ['radio', 'sis'], stop: ['ignore'] },
  rescue_coords: { go: ['report'], stop: ['later'] },
  rescue_arrival: { go: ['flare', 'flare_leave'], stop: ['pass'] },
  group_scout: { go: ['dad', 'talk'], stop: ['refuse'] },
  group_test: { go: ['mom', 'med'], stop: ['refuse'] },
  group_join: { go: ['pay'], stop: ['delay'] },
  car_found: { go: ['inspect'], stop: ['ignore'] },
  car_repair: { go: ['sis', 'toolkit'], stop: ['later'] },
  car_depart: { go: ['go'], stop: ['wait'] },
  walk_rumor: { go: ['ask', 'listen'], stop: ['ignore'] },
  walk_scout: { go: ['map', 'dad', 'me'], stop: ['later'] },
  walk_depart: { go: ['go'], stop: ['wait'] },
  caravan_meet: { go: ['trade'], stop: ['ignore'] },
  caravan_job: { go: ['sis', 'toolkit', 'fuel'], stop: ['none'] },
  caravan_leave: { go: ['go'], stop: ['wait'] },
  train_whistle: { go: ['radio', 'sis', 'dad'], stop: ['ignore'] },
  train_register: { go: ['dad', 'me'], stop: ['later'] },
  train_board: { go: ['board'], stop: ['wait'] },
};

// 미션 단계(항상 진행하는 쪽으로)
const MISSION_PREFS = {
  dog_dig: ['dig'],
  dog_hungry: ['feed', 'none'],
  garden_sprout: ['scarecrow', 'water', 'leave'],
  garden_harvest: ['replant', 'harvest'],
  dj_cache: ['dad', 'skip'],
  granny_gift: ['share'],
};

const RANDOM_PREFS = {
  raid: ['dad', 'bat', 'hide'],
  looters: ['dad', 'bat', 'give'],
  injury_worse: ['med', 'mom', 'wait'],
  rain: ['window'],
  trade: ['decline'],
  spoiled: ['discard'],
  lost_child: ['refuse'],
  family_return: ['accept'],
  quarrel: ['stop'],
  dog_stray: ['adopt', 'shoo'],
  garden_find: ['plant', 'eat'],
  airdrop: ['dad', 'skip'],
  gambler: ['decline'],
  vending: ['toolkit', 'coin'],
  mystery_cans: ['dog', 'open'],
  granny_knock: ['mom', 'med', 'ignore'],
  depression: ['mom', 'dog', 'listen'],
  voices: ['mom', 'med', 'stay'],
  nightmare: ['hug'],
  cabin_fever: ['window'],
  argument: ['mediate'],
  birthday: ['song'],
  board_game: ['play'],
  radio_music: ['off'],
  note: ['pin'],
  dysentery: ['med', 'boil', 'endure'],
  fever: ['med', 'mom', 'endure'],
  toothache: ['med', 'pull'],
  pipe_leak: ['toolkit', 'pot'],
  cold_snap: ['huddle'],
  flyby: ['watch'],
  stranger_cough: ['water', 'refuse'],
  white_robes: ['refuse'],
  gang_note: ['ambush', 'pay', 'ignore'],
  gang_raid: ['fight', 'bat', 'give'],
  dj_station: ['listen'],
  fire: ['water', 'dad', 'me'],
  horde_warning: ['toolkit', 'dad', 'pray'],
  horde: ['dad', 'hold'],
  mutant: ['flare', 'dad', 'hide'],
  acid_rain: ['toolkit', 'endure'],
  bombing: ['cellar', 'leave'],
  turned_neighbor: ['toolkit', 'dad', 'endure'],
  bunker_found: ['move', 'stay'],
};

const wants = (target, chainId) => target === 'all' || target === chainId;
const active = (game, id) => !['done', 'failed'].includes(game.director.chains[id].status);

export function chooseOption(game, target) {
  const view = game.eventView();
  const enabled = view.options.filter((o) => !o.disabled).map((o) => o.id);
  let prefs;
  if (MISSION_PREFS[view.id]) {
    prefs = MISSION_PREFS[view.id];
  } else if (view.id === 'dj_quiz') {
    prefs = [quizAnswerId(game.event.params), 'skip'];
  } else if (view.chainId) {
    const p = CHAIN_PREFS[view.id];
    prefs = wants(target, view.chainId) ? [...p.go, ...p.stop] : p.stop;
  } else {
    prefs = RANDOM_PREFS[view.id] ?? [];
  }
  return prefs.find((id) => enabled.includes(id)) ?? enabled[0];
}

/** 경로를 위해 남겨 둘 식량·물 */
export function reserveFor(game, target) {
  const group = game.director.chains.group;
  if (wants(target, 'group') && group.opened && active(game, 'group')) {
    return { food: group.data.food, water: group.data.water, med: group.stage <= 1 ? 1 : 0 };
  }
  const walk = game.director.chains.safezone;
  if (wants(target, 'safezone') && walk.opened && active(game, 'safezone') && walk.stage >= 1) {
    const n = game.presentPeople().length;
    return { food: n * SERVINGS, water: n * SERVINGS, med: 0 };
  }
  const caravan = game.director.chains.caravan;
  if (wants(target, 'caravan') && caravan.opened && active(game, 'caravan') && caravan.stage >= 2) {
    return { food: 0, water: SERVINGS, med: 0 };
  }
  return { food: 0, water: 0, med: 0 };
}

// ── 60초 탐색 ─────────────────────────────────

/** 60초 계획: 첫 마트 왕복(경로에 필요한 물건) → 가족 → 시간이 되는 만큼 식량·물 왕복 → 집으로 들어가기 */
export function scrambleLegs(target, bring = ['dad', 'mom', 'sis']) {
  let first = ['water', 'water', 'canned', 'canned'];
  if (target === 'rescue' || target === 'all') first = ['radio', 'battery', 'battery', 'flare'];
  if (target === 'car') first = ['toolkit', 'roadmap', 'canned'];
  if (target === 'group') first = ['medkit', 'water', 'canned'];
  if (target === 'safezone') first = ['roadmap', 'water', 'canned', 'canned'];
  if (target === 'caravan') first = ['toolkit', 'battery', 'battery'];
  if (target === 'train') first = ['medkit', 'radio', 'battery'];
  const legs = [first];
  if (bring.includes('dad')) legs.push(['dad']);
  const pair = ['mom', 'sis'].filter((id) => bring.includes(id));
  if (pair.length) legs.push(pair);
  if (target === 'car') legs.push(['fuel', 'water', 'water']);
  for (let i = 0; i < 4; i++) legs.push(['water', 'water', 'canned', 'canned']);
  return legs;
}

/** 이사 계획: 식구를 먼저 옮기고, 물·통조림 한 짐 → 귀한 물건 → 남은 물·통조림 순으로 가방 4칸에 맞춰 나른다. */
const MOVE_PRIORITY = ['radio', 'flare', 'bandage', 'roadmap', 'fuel', 'battery', 'toolkit', 'bat', 'water', 'canned'];
export function moveLegs(game) {
  const move = game.pendingMove ?? null;
  const run = game.run;
  const map = run?.map ?? move.map;
  const stock = { ...(run?.martStock ?? move.martStock) };
  const familyIds = run?.familyIds ?? move.familyIds;
  const legs = [];
  if (familyIds.includes('dad')) legs.push(['dad']);
  const pair = ['mom', 'sis'].filter((id) => familyIds.includes(id));
  if (pair.length) legs.push(pair);
  const queue = [];
  // 물과 통조림은 번갈아 넣어 어느 한쪽만 남지 않게 한다
  for (const id of MOVE_PRIORITY) {
    const shelf = map.shelves.find((s) => s.itemId === id);
    if (!shelf) continue;
    for (let i = 0; i < stock[shelf.id]; i++) queue.push(id);
  }
  const food = queue.filter((id) => id === 'canned');
  const water = queue.filter((id) => id === 'water');
  const rest = queue.filter((id) => id !== 'canned' && id !== 'water');
  const mixed = [];
  while (food.length || water.length) {
    if (water.length) mixed.push(water.shift());
    if (food.length) mixed.push(food.shift());
  }
  let leg = [];
  let used = 0;
  for (const id of [...mixed.slice(0, 4), ...rest, ...mixed.slice(4)]) {
    const slots = ['toolkit', 'fuel'].includes(id) ? 2 : 1;
    if (used + slots > 4) {
      legs.push(leg);
      leg = [];
      used = 0;
    }
    leg.push(id);
    used += slots;
  }
  if (leg.length) legs.push(leg);
  return legs;
}

/** 이사 사건을 고른 뒤: 카운트다운을 누르고 봇으로 짐을 옮긴다. */
export function playMove(game, botOptions) {
  if (game.phase !== 'ready' || !game.pendingMove) return null;
  const legs = moveLegs(game);
  game.startRun();
  return playScramble(game, legs, botOptions);
}

/** 실시간 구간을 봇으로 끝까지 진행한다. */
export function playScramble(game, legs, botOptions) {
  const bot = new RunBot(scramblePlan(legs, game.run.martStock, game.run.map), botOptions);
  let guard = 0;
  while (game.phase === 'run' && guard++ < 10000) game.stepRun(SIM_STEP, bot.next(game.run));
  return game.lastRun;
}

// ── 탐사 ─────────────────────────────────────

/** 누구를 보낼지: 아빠 → 엄마 → 동생 순(다치지 않고 마음이 괜찮은 사람 먼저). 주인공은 보내지 않는다. */
export function expeditionMember(game) {
  const order = ['dad', 'mom', 'sis'];
  const allowed = (id) => !game.expeditionReason(id);
  const fit = (id) => game.person(id).health === 0 && game.person(id).mood < 2;
  return order.find((id) => allowed(id) && fit(id)) ?? order.find(allowed) ?? null;
}

/** 오늘 이야기를 나눌 사람: 마음이 가장 힘든 가족 */
export function talkTarget(game) {
  const list = game.presentPeople().filter((p) => !game.talkReason(p.id));
  if (!list.length) return null;
  return list.sort((a, b) => b.mood - a.mood)[0].id;
}

/** 보낼 수 있으면 늘 한 명을 내보낸다(무엇을 가져올지는 고를 수 없다). */
export function expeditionPlan(game) {
  if (game.expeditionReason()) return null;
  // 연달아 세 번째부터는 하룻밤 쉬어 간다(한 끼 몫도 안 남았을 때만 무리해서 보낸다)
  const n = game.presentPeople().length;
  const urgent = game.stock.food < n || game.stock.water < n;
  if (game.nextTripStreak() >= 3 && !urgent) return null;
  const memberId = expeditionMember(game);
  if (!memberId) return null;
  return { memberId, withWeapon: game.stock.weapon > 0 };
}

// ── 집 ───────────────────────────────────────

/** 식량·물 배급 계획: 경로용으로 남길 몫은 빼고, 목마르거나 배고픈 사람에게만. { id: { food, water } } */
export function desiredRations(game, target) {
  const reserve = reserveFor(game, target);
  const present = game.presentPeople();
  const plan = Object.fromEntries(present.map((p) => [p.id, { food: false, water: false }]));
  // 경로용으로 아껴 둔 몫도, 오늘 밤 숨질 사람이 있으면 내어 준다
  let water = game.stock.water - reserve.water;
  let spare = reserve.water;
  for (const p of [...present].sort((a, b) => b.thirst - a.thirst)) {
    if (p.thirst < THIRST_NOTICE) continue;
    if (water > 0) water -= 1;
    else if (p.thirst >= THIRST_DEATH - 1 && spare > 0 && game.stock.water > 0) spare -= 1;
    else continue;
    plan[p.id].water = true;
  }
  let food = game.stock.food - reserve.food;
  spare = reserve.food;
  for (const p of [...present].sort((a, b) => b.hunger - a.hunger)) {
    if (p.hunger < HUNGER_NOTICE) continue;
    if (food > 0) food -= 1;
    else if (p.hunger >= HUNGER_DEATH - 1 && spare > 0 && game.stock.food > 0) spare -= 1;
    else continue;
    plan[p.id].food = true;
  }
  return plan;
}

export function setRations(game, target) {
  const plan = desiredRations(game, target);
  for (const id of Object.keys(plan)) {
    game.setRation(id, 'food', false);
    game.setRation(id, 'water', false);
  }
  for (const [id, r] of Object.entries(plan)) {
    if (r.food) game.setRation(id, 'food', true);
    if (r.water) game.setRation(id, 'water', true);
  }
}

/** 다음에 할 치료 하나: { action: 'med' | 'mom-care', person } 또는 null */
export function nextTreatment(game, target) {
  const reserve = reserveFor(game, target);
  const order = game.presentPeople();
  for (const p of order) {
    if (p.health > 0 && game.stock.med > reserve.med && !game.medReason(p.id)) return { action: 'med', person: p.id };
  }
  for (const p of order) {
    if (p.health > 0 && !game.momCareReason(p.id)) return { action: 'mom-care', person: p.id };
  }
  return null;
}

export function treat(game, target) {
  for (let guard = 0; guard < 20; guard++) {
    const next = nextTreatment(game, target);
    if (!next) return;
    if (next.action === 'med') game.useMed(next.person);
    else game.momCare(next.person);
  }
}

/**
 * 처음부터 결말(또는 maxDays)까지 플레이한다.
 * bring: 60초 동안 데려올 가족 id 목록
 */
export function playGame(game, { target = 'all', bring = ['dad', 'mom', 'sis'], maxDays = 100, onDay = null, legs = null } = {}) {
  game.startFirstRun();
  playScramble(game, legs ?? scrambleLegs(target, bring));
  while (game.phase === 'home' && game.day <= maxDays) {
    onDay?.(game);
    for (let i = 0; i < 4 && game.phase === 'home' && game.event && !game.event.resolved; i++) {
      game.chooseOption(chooseOption(game, target));
      if (game.phase === 'ready') playMove(game); // 이사하기로 했으면 짐을 옮긴다
    }
    if (game.phase !== 'home') break;
    const plan = expeditionPlan(game);
    if (plan) game.sendExpedition(plan);
    const listener = talkTarget(game);
    if (listener) game.talk(listener);
    treat(game, target);
    setRations(game, target);
    game.endDay();
  }
  return game;
}
