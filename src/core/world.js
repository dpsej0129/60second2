// 실시간 구간의 지도: 왼쪽 대형 마트 → 차가 버려진 거리 → 오른쪽 집.
import { ITEMS } from './items.js';

export const WORLD = { w: 1540, h: 720 }; // 마트를 여러 번 오갈 수 있게 거리를 짧게 잡았다

const rect = (x, y, w, h, kind) => ({ x, y, w, h, kind });

export const MART = rect(40, 60, 640, 600, 'mart');
export const MART_INNER = rect(56, 76, 608, 568, 'mart-inner');
// 출입구: 오른쪽 정문 + 위·아래 옆문. 옆문으로 나가면 지도 가장자리 길을 따라 거리로 이어진다.
// inside/outside 는 좀비가 마트 안팎을 오갈 때 거쳐 가는 지점이다.
export const MART_DOORS = [
  { id: 'front', gap: rect(664, 300, 16, 120, 'door'), inside: { x: 630, y: 360 }, outside: { x: 720, y: 360 } },
  { id: 'north', gap: rect(332, 60, 80, 16, 'door'), inside: { x: 372, y: 104 }, outside: { x: 372, y: 30 } },
  { id: 'south', gap: rect(332, 644, 80, 16, 'door'), inside: { x: 372, y: 616 }, outside: { x: 372, y: 690 } },
];

export const WALLS = [
  rect(40, 60, 292, 16, 'wall'),
  rect(412, 60, 268, 16, 'wall'),
  rect(40, 644, 292, 16, 'wall'),
  rect(412, 644, 268, 16, 'wall'),
  rect(40, 60, 16, 600, 'wall'),
  rect(664, 60, 16, 240, 'wall'),
  rect(664, 420, 16, 240, 'wall'),
];

const RACK_COLS = [140, 280, 420, 560];
const RACK_ROWS = [122, 428];
const RACK_H = 170;
export const RACKS = RACK_COLS.flatMap((x) => RACK_ROWS.map((y) => rect(x, y, 44, RACK_H, 'rack')));

// [선반 열, 줄(0 위/1 아래), 칸(0 위쪽/1 아래쪽), 물품, 수량] — 시드가 없을 때의 기본 배치
// 시드가 있으면 같은 물품·수량 묶음을 15칸에 무작위로 섞어 놓는다(createMartMap).
const SHELF_LAYOUT = [
  [0, 0, 0, 'medkit', 2],
  [0, 0, 1, 'radio', 1],
  [0, 1, 0, 'bandage', 3],
  [0, 1, 1, 'toolkit', 1],
  [1, 0, 0, 'battery', 4],
  [1, 0, 1, 'flare', 2],
  [1, 1, 0, 'canned', 6],
  [1, 1, 1, 'roadmap', 1],
  [2, 0, 0, 'water', 6],
  [2, 0, 1, 'canned', 6],
  [2, 1, 0, 'bat', 1],
  [2, 1, 1, 'fuel', 3],
  [3, 0, 0, 'water', 6],
  [3, 0, 1, 'canned', 6],
  [3, 1, 0, 'water', 6],
];

function buildShelves(goods) {
  return SHELF_LAYOUT.map(([col, row, slot], i) => {
    const [itemId, stock] = goods[i];
    if (!ITEMS[itemId]) throw new Error(`알 수 없는 물품 ${itemId}`);
    const rack = RACKS[col * RACK_ROWS.length + row];
    return {
      id: `shelf-${i + 1}`,
      itemId,
      initialStock: stock,
      rack,
      x: rack.x + rack.w / 2,
      y: rack.y + RACK_H * (slot ? 0.75 : 0.25),
    };
  });
}

const DEFAULT_GOODS = SHELF_LAYOUT.map(([, , , itemId, stock]) => [itemId, stock]);

/** 기본 배치(시드와 무관). 새 게임은 createMartMap(rng)로 섞인 배치를 쓴다. */
export const SHELVES = buildShelves(DEFAULT_GOODS);

export const CARS = [
  rect(790, 150, 140, 60, 'car'),
  rect(850, 540, 150, 60, 'car'),
  rect(1010, 300, 60, 130, 'car'),
  rect(1060, 130, 120, 60, 'car'),
  rect(1090, 560, 130, 60, 'car'),
];

export const HOUSE = rect(1300, 250, 200, 220, 'house');
export const HOME_DOOR = { x: 1300, y: 360 };
export const HOME_ZONE = rect(1256, 320, 44, 80, 'home-zone'); // 이 안에 들어오면 집 도착

export const START = { x: 92, y: 360 }; // 마트 안쪽에서 시작

// 집 주변에 흩어져 숨어 있는 가족(데려와야 하는 '물품'처럼 칸을 차지한다)
export const FAMILY_SPOTS = {
  dad: { x: 1230, y: 90 },
  mom: { x: 1440, y: 640 },
  sis: { x: 1050, y: 672 },
};

export const STREET = rect(760, 24, 420, 672, 'street'); // 거리 좀비가 나타나는 영역

export const SOLIDS = [...WALLS, ...RACKS, ...CARS, HOUSE];

/**
 * 실시간 구간 지도. 마트(처음 80초)와 이사 지도가 같은 모양을 쓴다.
 * indoor: 물품이 있는 건물 안(좀비가 출입구로만 드나든다), doors: 그 출입구, shelves: 집을 수 있는 물품 자리,
 * house/homeZone: 도착지, street: 좀비가 나타나는 거리, spawnInside: 처음부터 건물 안에 있는 좀비 자리(null이면 없음)
 */
export function createMartMap(rng = null) {
  const goods = rng ? rng.shuffle(DEFAULT_GOODS) : DEFAULT_GOODS;
  return {
    id: 'mart',
    outer: MART,
    indoor: MART_INNER,
    doors: MART_DOORS,
    walls: WALLS,
    racks: RACKS,
    cars: CARS,
    house: HOUSE,
    homeZone: HOME_ZONE,
    homeDoor: HOME_DOOR,
    start: START,
    familySpots: FAMILY_SPOTS,
    street: STREET,
    spawnInside: rect(470, MART_INNER.y + 16, MART_INNER.x + MART_INNER.w - 16 - 470, MART_INNER.h - 32, 'spawn'),
    shelves: rng ? buildShelves(goods) : SHELVES,
    solids: SOLIDS,
    zombieSolids: [...SOLIDS, HOME_ZONE],
    laneY: 360,
    labels: { indoor: '대형 마트', door: '정문 →', doorAt: { x: MART.x + MART.w + 40, y: 292 }, home: '집', arrive: '도착', inside: '마트 안' },
    colors: { floor: '#30363c', house: '#8b5e3c', roof: '#5d3b24' },
  };
}

/** 시드와 무관한 기본 마트 지도 */
export const MART_MAP = createMartMap();

/** 지도(마트 또는 이사 지도)의 선반 재고 { 선반 id: 수량 } */
export function initialMartStock(map = MART_MAP) {
  return Object.fromEntries(map.shelves.map((s) => [s.id, s.initialStock]));
}

export function inRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function inMart(p, map = MART_MAP) {
  return inRect(p, map.indoor);
}

function circleHitsRect(x, y, r, box) {
  const nx = Math.max(box.x, Math.min(x, box.x + box.w));
  const ny = Math.max(box.y, Math.min(y, box.y + box.h));
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < r * r;
}

export function collides(x, y, r, solids = SOLIDS) {
  if (x < r || y < r || x > WORLD.w - r || y > WORLD.h - r) return true;
  for (const s of solids) if (circleHitsRect(x, y, r, s)) return true;
  return false;
}

const CORNER_NUDGE = 10; // 모서리에 걸렸을 때 이 거리 안에서 옆으로 비켜 지나간다

/** 한 축으로만 움직이다 모서리에 걸리면, 조금 옆으로 비켜서 돌아 나가게 한다(키보드 조작용). */
function slideAroundCorner(entity, dx, dy, solids) {
  const step = Math.abs(dx || dy);
  for (let k = 1; k <= CORNER_NUDGE; k++) {
    for (const sign of [-1, 1]) {
      const px = dx ? entity.x + dx : entity.x + sign * k;
      const py = dy ? entity.y + dy : entity.y + sign * k;
      if (collides(px, py, entity.r, solids)) continue;
      if (dx) {
        const ny = entity.y + sign * Math.min(step, k);
        if (!collides(entity.x, ny, entity.r, solids)) entity.y = ny;
      } else {
        const nx = entity.x + sign * Math.min(step, k);
        if (!collides(nx, entity.y, entity.r, solids)) entity.x = nx;
      }
      return;
    }
  }
}

/** 축을 나눠 움직여 벽을 따라 미끄러지게 한다. */
export function moveCircle(entity, dx, dy, solids = SOLIDS) {
  if (dx) {
    if (!collides(entity.x + dx, entity.y, entity.r, solids)) entity.x += dx;
    else if (!dy) slideAroundCorner(entity, dx, 0, solids);
  }
  if (dy) {
    if (!collides(entity.x, entity.y + dy, entity.r, solids)) entity.y += dy;
    else if (!dx) slideAroundCorner(entity, 0, dy, solids);
  }
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentHitsRect(ax, ay, bx, by, box) {
  // Liang–Barsky 선분-사각형 교차
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const edges = [
    [-dx, ax - box.x],
    [dx, box.x + box.w - ax],
    [-dy, ay - box.y],
    [dy, box.y + box.h - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

/** 벽·선반·차·집이 시야를 가리지 않는지 */
export function lineOfSight(a, b, solids = SOLIDS) {
  for (const s of solids) if (segmentHitsRect(a.x, a.y, b.x, b.y, s)) return false;
  return true;
}
