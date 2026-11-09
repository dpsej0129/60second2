// 4칸 가방. 물품마다 차지하는 칸 수가 다르다.
import { INVENTORY_SLOTS } from './constants.js';
import { ITEMS } from './items.js';

export class Inventory {
  constructor(capacity = INVENTORY_SLOTS) {
    this.capacity = capacity;
    this.items = []; // 물품 id 목록 (들어온 순서)
  }

  get used() {
    return this.items.reduce((sum, id) => sum + ITEMS[id].slots, 0);
  }

  get free() {
    return this.capacity - this.used;
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  canAdd(itemId) {
    return ITEMS[itemId].slots <= this.free;
  }

  add(itemId) {
    if (!this.canAdd(itemId)) return false;
    this.items.push(itemId);
    return true;
  }

  removeAt(index) {
    if (index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0];
  }

  /** 화면에 칸을 그릴 때 쓰는 배치: [{ index, itemId, start, slots }] */
  layout() {
    let start = 0;
    return this.items.map((itemId, index) => {
      const cell = { index, itemId, start, slots: ITEMS[itemId].slots };
      start += cell.slots;
      return cell;
    });
  }
}
