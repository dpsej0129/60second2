import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INVENTORY_SLOTS } from '../src/core/constants.js';
import { Inventory, carryInfo } from '../src/core/inventory.js';
import { ITEMS } from '../src/core/items.js';

test('가방은 4칸이고 물품마다 차지하는 칸 수가 다르다', () => {
  assert.equal(INVENTORY_SLOTS, 4);
  assert.equal(ITEMS.canned.slots, 1);
  assert.equal(ITEMS.water.slots, 1);
  assert.equal(ITEMS.medkit.slots, 2, '여러 번 쓰는 대형 구급상자는 2칸');
  assert.equal(ITEMS.medkit.gives.med, 3, '대형 구급상자는 구급약 3회분');
  assert.equal(ITEMS.bandage.slots, 1);
  assert.equal(ITEMS.fuel.slots, 2);
});

test('식량·물은 챙긴 개수 그대로 재고가 된다(1개 = 1)', () => {
  assert.deepEqual(ITEMS.canned.gives, { food: 1 });
  assert.deepEqual(ITEMS.water.gives, { water: 1 });
  assert.deepEqual(ITEMS.battery.gives, { battery: 1 });
  assert.equal(ITEMS.ration, undefined, '묶음 식량은 없다');
  assert.equal(ITEMS.waterPack, undefined, '묶음 생수는 없다');
});

test('가족도 물품처럼 칸을 차지한다', () => {
  assert.equal(carryInfo('dad').slots, 3);
  assert.equal(carryInfo('mom').slots, 2);
  assert.equal(carryInfo('sis').slots, 2);
  assert.equal(carryInfo('dad').kind, 'person');
  const inv = new Inventory();
  assert.ok(inv.add('dad'));
  assert.equal(inv.free, 1);
  assert.equal(inv.canAdd('mom'), false, '아빠(3칸)를 데려가는 중엔 엄마(2칸)를 함께 데려갈 수 없다');
  assert.ok(inv.add('water'), '1칸짜리 물품은 함께 들 수 있다');
  const both = new Inventory();
  assert.ok(both.add('mom'));
  assert.ok(both.add('sis'), '엄마와 동생은 함께 데려갈 수 있다');
  assert.equal(both.free, 0);
});

test('칸이 모자라면 물품을 넣을 수 없다', () => {
  const inv = new Inventory();
  assert.ok(inv.add('medkit'));
  assert.ok(inv.add('water'));
  assert.equal(inv.used, 3);
  assert.equal(inv.free, 1);
  assert.equal(inv.canAdd('fuel'), false, '2칸짜리는 1칸 남았을 때 못 넣는다');
  assert.equal(inv.add('fuel'), false);
  assert.ok(inv.add('canned'));
  assert.equal(inv.free, 0);
  assert.equal(inv.add('canned'), false);
  assert.deepEqual(
    inv.layout().map((c) => [c.itemId, c.start, c.slots]),
    [
      ['medkit', 0, 2],
      ['water', 2, 1],
      ['canned', 3, 1],
    ],
  );
  assert.equal(inv.removeAt(0), 'medkit');
  assert.equal(inv.free, 2);
  assert.deepEqual(inv.takeAll(), ['water', 'canned']);
  assert.equal(inv.isEmpty, true);
});
