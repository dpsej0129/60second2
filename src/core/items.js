// 물품. slots = 가방에서 차지하는 칸 수, gives = 집 재고로 들어올 때 늘어나는 자원.
import { INVENTORY_SLOTS } from './constants.js';

// 식량·물은 챙긴 개수 그대로 재고가 된다(1개 = 1). 여러 번 쓰는 대형 구급상자만 3회분이다.
export const ITEMS = {
  canned: { id: 'canned', name: '통조림', short: '통조림', slots: 1, gives: { food: 1 }, note: '식량 1' },
  water: { id: 'water', name: '생수', short: '생수', slots: 1, gives: { water: 1 }, note: '물 1' },
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
  food: { name: '식량', unit: '개' },
  water: { name: '물', unit: '개' },
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

export function formatResources(bag) {
  return Object.entries(bag)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${RESOURCES[key].name} ${n}`)
    .join(', ');
}
