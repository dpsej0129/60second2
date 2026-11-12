// 탐사: 생존 단계에서 한 명을 밖으로 내보내 물자를 구해 온다.
// 떠난 사람은 1~2일 뒤 아침에 돌아오고(먹고 마시지 않는 대신 사건에서 도울 수 없다),
// 다치거나 영영 돌아오지 못할 수도 있다. 탐사를 거듭할수록 위험해진다.
// 무엇을 가져올지는 고를 수 없다. 마트 재고와 상관없이 모든 물품 중에서 무작위로 나온다.
import { EXPEDITION_CAPACITY } from './constants.js';
import { ITEMS } from './items.js';

/** 물품이 나올 가중치. 식량·물이 가장 흔하지만 어떤 물품이든 나올 수 있다. */
export const LOOT_WEIGHTS = {
  canned: 5,
  water: 5,
  bandage: 2,
  medkit: 0.8,
  radio: 0.6,
  battery: 1.6,
  flare: 1,
  bat: 0.6,
  toolkit: 0.7,
  fuel: 1.2,
  roadmap: 0.8,
};

/** 지금 꼭 필요한 물품(열린 탈출 경로의 조건 등)은 조금 더 잘 나온다. */
export const NEED_BOOST = 3;

/**
 * 이번 탐사의 위험도. count = 지금까지 떠난 탐사 수, scale = 난이도·지름길 등에 따른 배수.
 * lost: 돌아오지 못할 확률, injury: 다쳐서 돌아올 확률
 */
export function expeditionRisk(member, { withWeapon = false, count = 0, scale = 1 } = {}) {
  // 탐사를 거듭할수록 위험해지지만, 100일 가까이 버티는 동안 여러 번 보낼 수 있도록 천천히 오른다.
  let lost = Math.min(0.12, 0.03 + 0.004 * count);
  let injury = Math.min(0.32, 0.12 + 0.008 * count);
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
  if ((member.mood ?? 0) >= 2) lost *= 1.4; // 울적한 사람은 위험을 잘 피하지 못한다
  lost *= scale;
  injury *= scale;
  return { lost: Math.min(0.6, lost), injury: Math.min(0.75, injury) };
}

/**
 * 무작위 물품 목록을 뽑는다.
 *  slots: 채울 수 있는 칸 수, count: 정확히 뽑을 개수(주면 칸 수 대신 개수로 뽑는다)
 *  needs: 조금 더 잘 나오게 할 물품 id 목록
 */
export function rollItems({ rng, slots = EXPEDITION_CAPACITY, count = null, needs = [] }) {
  const items = [];
  let free = slots;
  const weightOf = (id) => LOOT_WEIGHTS[id] * (needs.includes(id) ? NEED_BOOST : 1);
  for (;;) {
    if (count != null && items.length >= count) break;
    const candidates = Object.keys(ITEMS).filter((id) => count != null || ITEMS[id].slots <= free);
    if (!candidates.length) break;
    if (count == null && items.length >= 2 && rng.chance(0.15)) break; // 가방을 다 채우지 못하고 돌아오기도 한다
    const id = rng.weighted(candidates, weightOf);
    items.push(id);
    free -= ITEMS[id].slots;
    if (count == null && free <= 0) break;
  }
  return items;
}

/** 탐사에서 가져오는 것: 가방에 담아 온 물품 + 길에서 주운 식량·물(나눠 먹는 단위, ¼캔씩) */
export function rollLoot({ rng, capacity = EXPEDITION_CAPACITY, found = [1, 2], needs = [] }) {
  const items = rollItems({ rng, slots: capacity, needs });
  const extra = { food: 0, water: 0 };
  const n = rng.int(found[0], found[1]);
  for (let i = 0; i < n; i++) extra[rng.chance(0.5) ? 'food' : 'water'] += 1;
  return { items, extra };
}
