// 4칸 가방. 물품마다(그리고 가족마다) 차지하는 칸 수가 다르다.
import { INVENTORY_SLOTS } from './constants.js';
import { ITEMS } from './items.js';
import { FAMILY_DEFS } from './people.js';

const PERSONS = Object.fromEntries(
  FAMILY_DEFS.map((d) => [d.id, { id: d.id, name: d.name, short: d.name, slots: d.slots, kind: 'person', note: d.carryNote, color: d.color }]),
);

export const isPerson = (id) => id in PERSONS;

/** 가방에 넣을 수 있는 것(물품 또는 가족)의 이름·칸 수 */
export function carryInfo(id) {
  if (ITEMS[id]) return { ...ITEMS[id], kind: 'item' };
  if (PERSONS[id]) return PERSONS[id];
  throw new Error(`가방에 넣을 수 없는 것: ${id}`);
}

export class Inventory {
  constructor(capacity = INVENTORY_SLOTS) {
    this.capacity = capacity;
    this.items = []; // 물품 id 목록 (들어온 순서)
  }

  get used() {
    return this.items.reduce((sum, id) => sum + carryInfo(id).slots, 0);
  }

  get free() {
    return this.capacity - this.used;
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  canAdd(id) {
    return carryInfo(id).slots <= this.free;
  }

  add(id) {
    if (!this.canAdd(id)) return false;
    this.items.push(id);
    return true;
  }

  /** 전부 꺼낸다 */
  takeAll() {
    return this.items.splice(0, this.items.length);
  }

  removeAt(index) {
    if (index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0];
  }

  /** 화면에 칸을 그릴 때 쓰는 배치: [{ index, itemId, start, slots, kind }] */
  layout() {
    let start = 0;
    return this.items.map((itemId, index) => {
      const info = carryInfo(itemId);
      const cell = { index, itemId, start, slots: info.slots, kind: info.kind, name: info.name, note: info.note };
      start += cell.slots;
      return cell;
    });
  }
}
