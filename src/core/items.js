// 물품. slots = 가방에서 차지하는 칸 수, gives = 집 재고로 들어올 때 늘어나는 자원.
import { INVENTORY_SLOTS } from './constants.js';

// 식량·물은 60 Seconds!처럼 한 캔(한 병)을 여러 번 나눠 먹는다.
// 재고는 '한 사람이 한 번 먹는 양(1/4캔)' 단위로 센다. 통조림 1캔 = 4번, 생수 1병 = 4번.
export const SERVINGS = 4;

export const ITEMS = {
  canned: { id: 'canned', name: '통조림', short: '통조림', slots: 1, gives: { food: SERVINGS }, note: '1캔 · 4번 나눠 먹는다' },
  water: { id: 'water', name: '생수', short: '생수', slots: 1, gives: { water: SERVINGS }, note: '1병 · 4번 나눠 마신다' },
  bandage: { id: 'bandage', name: '소형 구급약', short: '구급약', slots: 1, gives: { med: 1 }, note: '구급약 1회분' },
  medkit: { id: 'medkit', name: '대형 구급상자', short: '구급상자', slots: 2, gives: { med: 3 }, note: '구급약 3회분 · 여러 번 쓸 수 있다' },
  radio: { id: 'radio', name: '무전기', short: '무전기', slots: 1, gives: { radio: 1 }, note: '외부와 교신할 수 있다' },
  battery: { id: 'battery', name: '건전지', short: '건전지', slots: 1, gives: { battery: 1 }, note: '건전지 1개' },
  flare: { id: 'flare', name: '신호탄', short: '신호탄', slots: 1, gives: { flare: 1 }, note: '하늘에 위치를 알린다' },
  bat: { id: 'bat', name: '야구 방망이', short: '방망이', slots: 1, gives: { weapon: 1 }, note: '습격·약탈에 맞설 수 있다' },
  toolkit: { id: 'toolkit', name: '공구 상자', short: '공구', slots: 2, gives: { toolkit: 1 }, note: '기계를 고칠 수 있다 · 무겁다' },
  fuel: { id: 'fuel', name: '연료통', short: '연료통', slots: 2, gives: { fuel: 1 }, note: '휘발유 한 통 · 무겁다' },
  roadmap: { id: 'roadmap', name: '도로 지도', short: '지도', slots: 1, gives: { map: 1 }, note: '도시 밖으로 나가는 길' },
};

for (const item of Object.values(ITEMS)) {
  if (item.slots < 1 || item.slots > INVENTORY_SLOTS) throw new Error(`잘못된 칸 수: ${item.id}`);
}

export const RESOURCES = {
  food: { name: '통조림', unit: '캔', portions: true },
  water: { name: '물', unit: '병', portions: true },
  med: { name: '구급약', unit: '회분' },
  radio: { name: '무전기', unit: '대' },
  battery: { name: '건전지', unit: '개' },
  flare: { name: '신호탄', unit: '발' },
  weapon: { name: '야구 방망이', unit: '개' },
  toolkit: { name: '공구 상자', unit: '개' },
  fuel: { name: '연료통', unit: '통' },
  map: { name: '도로 지도', unit: '장' },
};

export const RESOURCE_KEYS = Object.keys(RESOURCES);

export function emptyStock() {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
}

const QUARTERS = ['', '¼', '½', '¾'];

/** 나눠 먹는 단위(1/4)를 캔·병으로: 6 → '1½', 4 → '1', 1 → '¼' */
export function portions(n) {
  const whole = Math.floor(n / SERVINGS);
  const rest = n % SERVINGS;
  if (!rest) return String(whole);
  return `${whole || ''}${QUARTERS[rest]}`;
}

/** 자원 하나를 사람이 읽는 말로: food 6 → '통조림 1½캔', battery 2 → '건전지 2개' */
export function formatAmount(key, n) {
  const res = RESOURCES[key];
  if (res.portions) return `${res.name} ${portions(n)}${res.unit}`;
  return `${res.name} ${n}${res.unit}`;
}

export function formatResources(bag) {
  return Object.entries(bag)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => formatAmount(key, n))
    .join(', ');
}
