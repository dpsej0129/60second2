import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INVENTORY_SLOTS } from '../src/core/constants.js';
import { Inventory } from '../src/core/inventory.js';
import { ITEMS } from '../src/core/items.js';
import { homeGame } from './helpers/setup.mjs';

test('가방은 4칸이고 물품마다 차지하는 칸 수가 다르다', () => {
  assert.equal(INVENTORY_SLOTS, 4);
  assert.equal(ITEMS.canned.slots, 1);
  assert.equal(ITEMS.water.slots, 1);
  assert.equal(ITEMS.medkit.slots, 2, '여러 번 쓰는 대형 구급상자는 2칸');
  assert.equal(ITEMS.medkit.gives.med, 3, '대형 구급상자는 구급약 3회분');
  assert.equal(ITEMS.bandage.slots, 1);
  assert.equal(ITEMS.fuel.slots, 2);
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
});

test('집에 도착하면 가방 물품을 재고로 옮기고 가방을 비울 수 있다', () => {
  const game = homeGame();
  game.inventory.add('medkit');
  game.inventory.add('water');
  game.inventory.add('canned');
  const before = { ...game.stock };
  game.deposit(1); // 생수 하나만 먼저
  assert.equal(game.stock.water, before.water + ITEMS.water.gives.water);
  assert.deepEqual(game.inventory.items, ['medkit', 'canned']);
  game.depositAll();
  assert.equal(game.inventory.isEmpty, true);
  assert.equal(game.stock.med, before.med + 3);
  assert.equal(game.stock.food, before.food + ITEMS.canned.gives.food);
});

test('재고로 옮긴 물자는 기본 배급표에 반영된다', () => {
  const game = homeGame({ bring: ['dad'] });
  assert.equal(game.rationCount('water'), 0);
  game.inventory.add('waterPack');
  game.depositAll();
  assert.equal(game.stock.water, ITEMS.waterPack.gives.water);
  assert.equal(game.rationCount('water'), 2, '2명 모두 물 배급');
});
