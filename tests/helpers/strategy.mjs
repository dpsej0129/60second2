// 게임 전체를 대신 플레이하는 전략(검증 도구). 목표 승리 경로(target)를 정하면
// 그 경로의 사건은 수락하고 나머지 경로는 거절하며, 필요한 물자를 보급해 온다.
//   target: 'rescue' | 'group' | 'car' | 'all'(모든 경로 수락) | 'none'(모든 경로 거절)
import { INVENTORY_SLOTS, SIM_STEP } from '../../src/core/constants.js';
import { ITEMS } from '../../src/core/items.js';
import { isCapable } from '../../src/core/people.js';
import { RunBot, shelvesFor } from './bot.mjs';

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
  if (wants(target, 'group') && group.opened && group.status !== 'failed' && group.status !== 'done') {
    return { food: group.data.food, water: group.data.water, med: group.stage <= 1 ? 1 : 0 };
  }
  return { food: 0, water: 0, med: 0 };
}

function pathItems(game, target) {
  const s = game.stock;
  const sis = game.person('sis');
  const out = [];
  if (wants(target, 'rescue') && !['done', 'failed'].includes(game.director.chains.rescue.status)) {
    if (!s.radio && !isCapable(sis)) out.push('radio');
    if (s.battery < 2) out.push('battery');
    if (!s.flare) out.push('flare');
  }
  if (wants(target, 'car') && !['done', 'failed'].includes(game.director.chains.car.status)) {
    if (!s.toolkit && !isCapable(sis)) out.push('toolkit');
    for (let i = s.fuel; i < 2; i++) out.push('fuel');
    if (!s.map) out.push('roadmap');
  }
  if (wants(target, 'group') && s.med < 1) out.push('bandage');
  return out;
}

export function planSupply(game, target) {
  const s = game.stock;
  const n = game.presentPeople().length;
  const reserve = reserveFor(game, target);
  const list = [...pathItems(game, target)];
  if (s.water < 3 * n + reserve.water) list.push('waterPack', 'water');
  if (s.food < 2 * n + reserve.food) list.push('ration', 'canned');
  list.push('water', 'canned', 'water', 'canned');
  const remaining = game.martSummary();
  const chosen = [];
  let slots = 0;
  for (const id of list) {
    if (remaining[id] > 0 && slots + ITEMS[id].slots <= INVENTORY_SLOTS) {
      chosen.push(id);
      slots += ITEMS[id].slots;
      remaining[id] -= 1;
    }
  }
  return chosen;
}

export function firstRunItems(target) {
  if (target === 'rescue') return ['radio', 'battery', 'flare', 'water'];
  if (target === 'car') return ['toolkit', 'roadmap', 'water'];
  return ['waterPack', 'ration'];
}

export function shouldRun(game, target) {
  if (game.canStartSupplyRun()) return false;
  const n = game.presentPeople().length;
  const reserve = reserveFor(game, target);
  const summary = game.martSummary();
  if (!planSupply(game, target).length) return false;
  if (pathItems(game, target).some((id) => summary[id] > 0)) return true;
  // 물은 이틀에 한 번, 식량은 사흘에 한 번 먹는다고 보고 약 3일치가 안 되면 나간다.
  return game.stock.water < Math.ceil(1.5 * n) + reserve.water || game.stock.food < n + reserve.food;
}

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
  // 보급을 나가는 내가 다치면 느려지므로 나부터 치료한다.
  const order = [...game.presentPeople()].sort((a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0));
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

/** 실시간 구간을 봇으로 끝까지 진행한다. */
export function playRun(game, itemIds, botOptions) {
  const bot = new RunBot(shelvesFor(itemIds, game.martStock), botOptions);
  let guard = 0;
  while (game.phase === 'run' && guard++ < 10000) game.stepRun(SIM_STEP, bot.next(game.run));
  return game.lastRun;
}

/**
 * 처음부터 결말(또는 maxDays)까지 플레이한다.
 * bring: 데려올 가족 id 목록
 */
export function playGame(game, { target = 'all', bring = ['dad', 'mom', 'sis'], maxDays = 40, onDay = null } = {}) {
  game.startFirstRun();
  playRun(game, firstRunItems(target));
  if (game.phase !== 'family') return game;
  while (game.phase === 'family') {
    const c = game.familyCandidate();
    game.decideFamily(c.id, bring.includes(c.id));
  }
  while (game.phase === 'home' && game.day <= maxDays) {
    onDay?.(game);
    game.depositAll();
    if (game.event && !game.event.resolved) game.chooseOption(chooseOption(game, target));
    if (game.phase !== 'home') break;
    game.depositAll();
    if (shouldRun(game, target)) {
      game.startSupplyRun();
      playRun(game, planSupply(game, target));
      if (game.phase !== 'home') break;
      game.depositAll();
    }
    treat(game, target);
    setRations(game, target);
    game.endDay();
  }
  return game;
}
