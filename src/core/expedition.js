// 탐사: 생존 단계에서 한 명을 마트로 내보내 물자를 구해 온다.
// 떠난 사람은 1~3일 뒤 아침에 돌아오고(먹고 마시지 않는 대신 사건에서 도울 수 없다),
// 다치거나 영영 돌아오지 못할 수도 있다. 탐사를 거듭할수록 위험해진다.
import { EXPEDITION_CAPACITY } from './constants.js';
import { ITEMS } from './items.js';
import { SHELVES } from './world.js';

/** 무엇을 찾아오라고 할지 */
export const EXPEDITION_TARGETS = [
  { id: 'supplies', name: '식량과 물', items: ['canned', 'water', 'ration', 'waterPack'] },
  { id: 'medical', name: '의약품', items: ['bandage', 'medkit'] },
  { id: 'radio', name: '무전기', items: ['radio'] },
  { id: 'battery', name: '건전지', items: ['battery'] },
  { id: 'flare', name: '신호탄', items: ['flare'] },
  { id: 'toolkit', name: '공구 상자', items: ['toolkit'] },
  { id: 'fuel', name: '연료통', items: ['fuel'] },
  { id: 'roadmap', name: '도로 지도', items: ['roadmap'] },
  { id: 'bat', name: '야구 방망이', items: ['bat'] },
];

export const targetOf = (id) => EXPEDITION_TARGETS.find((t) => t.id === id) ?? EXPEDITION_TARGETS[0];

/**
 * 이번 탐사의 위험도. count = 지금까지 다녀온(또는 떠났던) 탐사 수.
 * lost: 돌아오지 못할 확률, injury: 다쳐서 돌아올 확률
 */
export function expeditionRisk(member, { withWeapon = false, count = 0 } = {}) {
  let lost = 0.04 + 0.025 * count;
  let injury = 0.15 + 0.04 * count;
  if (member.trait === 'guard') {
    lost *= 0.5;
    injury *= 0.6;
  }
  if (withWeapon) {
    lost *= 0.6;
    injury *= 0.7;
  }
  if (member.health >= 1) {
    lost *= 1.6;
    injury *= 1.3;
  }
  if (member.hunger >= 2 || member.thirst >= 2) lost *= 1.3;
  return { lost: Math.min(0.5, lost), injury: Math.min(0.7, injury) };
}

export function martRemaining(martStock, itemId) {
  return SHELVES.filter((s) => s.itemId === itemId).reduce((sum, s) => sum + (martStock[s.id] ?? 0), 0);
}

function takeFromMart(martStock, itemId) {
  const shelf = SHELVES.find((s) => s.itemId === itemId && (martStock[s.id] ?? 0) > 0);
  if (!shelf) return false;
  martStock[shelf.id] -= 1;
  return true;
}

/**
 * 마트 재고에서 들고 올 물품을 고른다(마트 재고가 줄어든다).
 * 찾으라고 한 것은 남아 있고 칸이 맞으면 반드시 하나 가져온다. 나머지는 무작위로 채운다.
 * 돌아오는 길에 주운 식량·물(extra)이 조금 붙는다.
 */
export function rollLoot({ martStock, targetId, rng, capacity = EXPEDITION_CAPACITY }) {
  const target = targetOf(targetId);
  const items = [];
  let free = capacity;
  const fits = (id) => ITEMS[id].slots <= free && martRemaining(martStock, id) > 0;

  const wanted = rng.shuffle(target.items).find(fits);
  if (wanted && takeFromMart(martStock, wanted)) {
    items.push(wanted);
    free -= ITEMS[wanted].slots;
  }

  while (free > 0) {
    if (items.length && rng.chance(0.2)) break; // 다 채우지 못하고 서둘러 돌아오기도 한다
    const candidates = Object.keys(ITEMS).filter(fits);
    if (!candidates.length) break;
    const id = rng.weighted(candidates, (c) => {
      if (target.items.includes(c)) return 4;
      if (['canned', 'water', 'ration', 'waterPack'].includes(c)) return 2;
      if (['bandage', 'medkit'].includes(c)) return 1.2;
      return 0.5;
    });
    if (!takeFromMart(martStock, id)) break;
    items.push(id);
    free -= ITEMS[id].slots;
  }

  const extra = { food: 0, water: 0 };
  const found = rng.int(0, 2);
  for (let i = 0; i < found; i++) extra[rng.chance(0.5) ? 'food' : 'water'] += 1;
  return { items, extra, foundTarget: !!wanted };
}
