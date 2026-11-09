// 게임 전체를 대신 플레이하는 전략(검증 도구). 목표 승리 경로(target)를 정하면
// 그 경로의 사건은 수락하고 나머지 경로는 거절하며, 필요한 물자를 탐사로 구해 온다.
//   target: 'rescue' | 'group' | 'car' | 'all'(모든 경로 수락) | 'none'(모든 경로 거절)
import { SIM_STEP } from '../../src/core/constants.js';
import { isCapable } from '../../src/core/people.js';
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
};

const wants = (target, chainId) => target === 'all' || target === chainId;
const active = (game, id) => !['done', 'failed'].includes(game.director.chains[id].status);

export function chooseOption(game, target) {
  const view = game.eventView();
  const enabled = view.options.filter((o) => !o.disabled).map((o) => o.id);
  let prefs;
  if (view.chainId) {
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
  return { food: 0, water: 0, med: 0 };
}

// ── 60초 탐색 ─────────────────────────────────

/** 60초 계획: 첫 마트 왕복 → 가족 → (시간이 되면) 두 번째 마트 왕복 → 집으로 들어가기 */
export function scrambleLegs(target, bring = ['dad', 'mom', 'sis']) {
  let first = ['waterPack', 'ration'];
  if (target === 'rescue' || target === 'all') first = ['radio', 'battery', 'flare', 'water'];
  if (target === 'car') first = ['toolkit', 'roadmap', 'water'];
  const legs = [first];
  if (bring.includes('dad')) legs.push(['dad']);
  const pair = ['mom', 'sis'].filter((id) => bring.includes(id));
  if (pair.length) legs.push(pair);
  legs.push(['waterPack', 'ration']);
  legs.push(['canned', 'water', 'canned', 'water']);
  return legs;
}

/** 실시간 구간을 봇으로 끝까지 진행한다. */
export function playScramble(game, legs, botOptions) {
  const bot = new RunBot(scramblePlan(legs, game.martStock), botOptions);
  let guard = 0;
  while (game.phase === 'run' && guard++ < 10000) game.stepRun(SIM_STEP, bot.next(game.run));
  return game.lastRun;
}

// ── 탐사 ─────────────────────────────────────

function pathTargets(game, target) {
  const s = game.stock;
  const sis = game.person('sis');
  const out = [];
  if (wants(target, 'rescue') && active(game, 'rescue')) {
    if (!s.radio && !isCapable(sis)) out.push('radio');
    if (s.battery < 2) out.push('battery');
    if (!s.flare) out.push('flare');
  }
  if (wants(target, 'car') && active(game, 'car')) {
    if (!s.toolkit && !isCapable(sis)) out.push('toolkit');
    if (s.fuel < 2) out.push('fuel');
    if (!s.map) out.push('roadmap');
  }
  if (wants(target, 'group') && s.med < 1) out.push('medical');
  return out;
}

/** 탐사로 무엇을 찾을지. 필요 없으면 null */
export function expeditionTarget(game, target) {
  const n = Math.max(1, game.presentPeople().length);
  const reserve = reserveFor(game, target);
  const remaining = Object.fromEntries(game.expeditionTargets().map((t) => [t.id, t.remaining]));
  const short = game.stock.water < 3 * n + reserve.water || game.stock.food < 2 * n + reserve.food;
  const urgent = game.stock.water < n + reserve.water || game.stock.food < n + reserve.food;
  if (urgent && remaining.supplies > 0) return 'supplies';
  const needed = pathTargets(game, target).find((id) => remaining[id] > 0);
  if (needed) return needed;
  if (short && remaining.supplies > 0) return 'supplies';
  if (game.presentPeople().some((p) => p.health > 0) && game.stock.med < 1 && remaining.medical > 0) return 'medical';
  return null;
}

/** 누구를 보낼지: 아빠 → 엄마 → 동생 순(다치지 않은 사람 먼저), 주인공은 혼자 남았을 때만 */
export function expeditionMember(game) {
  const order = ['dad', 'mom', 'sis', 'me'];
  const allowed = (id) => !(id === 'me' && game.presentPeople().length > 1) && !game.expeditionReason(id);
  return order.find((id) => allowed(id) && game.person(id).health === 0) ?? order.find(allowed) ?? null;
}

export function expeditionPlan(game, target) {
  if (game.expeditionReason()) return null;
  const targetId = expeditionTarget(game, target);
  if (!targetId) return null;
  const memberId = expeditionMember(game);
  if (!memberId) return null;
  return { memberId, targetId, withWeapon: game.stock.weapon > 0 };
}

// ── 집 ───────────────────────────────────────

/** 식량·물 배급 계획: 경로용으로 남길 몫은 빼고, 목마르거나 배고픈 사람부터. { id: { food, water } } */
export function desiredRations(game, target) {
  const reserve = reserveFor(game, target);
  const present = game.presentPeople();
  const plan = Object.fromEntries(present.map((p) => [p.id, { food: false, water: false }]));
  let water = game.stock.water - reserve.water;
  for (const p of [...present].sort((a, b) => b.thirst - a.thirst)) {
    if (water <= 0) break;
    if (p.thirst >= 1 || water >= present.length * 3) {
      plan[p.id].water = true;
      water -= 1;
    }
  }
  let food = game.stock.food - reserve.food;
  for (const p of [...present].sort((a, b) => b.hunger - a.hunger)) {
    if (food <= 0) break;
    if (p.hunger >= 2 || food >= present.length * 3) {
      plan[p.id].food = true;
      food -= 1;
    }
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
export function playGame(game, { target = 'all', bring = ['dad', 'mom', 'sis'], maxDays = 40, onDay = null, legs = null } = {}) {
  game.startFirstRun();
  playScramble(game, legs ?? scrambleLegs(target, bring));
  while (game.phase === 'home' && game.day <= maxDays) {
    onDay?.(game);
    if (game.event && !game.event.resolved) game.chooseOption(chooseOption(game, target));
    if (game.phase !== 'home') break;
    const plan = expeditionPlan(game, target);
    if (plan) game.sendExpedition(plan);
    treat(game, target);
    setRations(game, target);
    game.endDay();
  }
  return game;
}
