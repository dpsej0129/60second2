// 60초 실시간 구간(마트 ↔ 집) 시뮬레이션. DOM과 무관한 순수 로직이라 테스트에서 그대로 돌릴 수 있다.
import {
  INJURY_SPEED_PENALTY,
  PICK_RANGE,
  PICKUP_SECONDS_PER_SLOT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RUN_SECONDS,
  WEIGHT_PENALTY_PER_SLOT,
  ZOMBIE_RADIUS,
} from './constants.js';
import { ITEMS } from './items.js';
import { josa } from './text.js';
import {
  HOME_DOOR,
  HOME_ZONE,
  MART_DOORS,
  MART_INNER,
  SHELVES,
  START_FIRST,
  START_SUPPLY,
  STREET,
  collides,
  dist,
  inMart,
  inRect,
  lineOfSight,
  moveCircle,
} from './world.js';

/** 보급 횟수가 늘수록 좀비가 많아지고 빨라진다. */
export function runDanger(mode, supplyIndex = 0) {
  const k = mode === 'first' ? 0 : supplyIndex;
  return {
    martZombies: mode === 'first' ? 2 : Math.min(3, Math.floor((k + 2) / 4)),
    streetZombies: mode === 'first' ? 2 : Math.min(7, 1 + Math.floor(k * 0.6)),
    spawnInterval: Math.max(5, 10 - 0.4 * k), // 거리 가장자리에서 새 좀비가 나타나는 간격(초)
    maxZombies: Math.min(16, 7 + k),
    speedMin: Math.min(70, 40 + 2 * k),
    speedMax: Math.min(86, 60 + 2 * k),
    sight: Math.min(290, 200 + 8 * k), // 이 거리 안에 들어오면 쫓아오기 시작한다(벽·선반 너머는 못 본다)
  };
}

export const HEARING_FACTOR = 0.6; // 물건을 집는 동안은 시야의 이 비율 안에서는 벽 너머로도 소리를 듣는다
export const SIGHT_GROWTH_PER_SECOND = 2; // 시간이 흐를수록 좀비 떼가 더 넓게 몰려든다
export const LOSE_SIGHT_FACTOR = 1.5; // 쫓던 좀비는 시야의 이 배수만큼 멀어져야 놓친다
export const WANDER_SPEED_FACTOR = 0.35;

/** 지금 이 순간 좀비의 시야 반경 */
export function zombieSight(run) {
  return run.danger.sight + run.elapsed * SIGHT_GROWTH_PER_SECOND;
}

/** 쫓고 있지 않던 좀비가 플레이어를 알아채는지: 시야 안 + 가리는 것 없음, 또는 물건 집는 소리 */
export function noticesPlayer(run, z, sight = zombieSight(run)) {
  const d = dist(z, run.player);
  if (d > sight) return false;
  if (run.pickup && d <= sight * HEARING_FACTOR) return true;
  return lineOfSight(z, run.player);
}

export function createRun({
  mode = 'first',
  supplyIndex = 0,
  inventory,
  martStock,
  rng,
  playerHealth = 0,
  familyMarkers = [],
  zombies = true,
  danger: dangerOverride = null,
}) {
  const start = mode === 'first' ? START_FIRST : START_SUPPLY;
  const danger = { ...runDanger(mode, supplyIndex), ...dangerOverride };
  const run = {
    mode,
    supplyIndex,
    danger,
    duration: RUN_SECONDS,
    elapsed: 0,
    timeLeft: RUN_SECONDS,
    outcome: null, // 'home' | 'caught' | 'timeout'
    player: { x: start.x, y: start.y, r: PLAYER_RADIUS, faceX: mode === 'first' ? 1 : -1, faceY: 0 },
    playerHealth,
    zombies: [],
    nextZombieId: 1,
    spawnTimer: danger.spawnInterval,
    pickup: null, // { shelfId, itemId, t, duration }
    toasts: [],
    picked: [],
    dropped: [],
    enteredMart: mode === 'first',
    inventory,
    martStock,
    rng,
    familyMarkers,
    zombiesEnabled: zombies,
  };
  if (zombies) {
    for (let i = 0; i < danger.martZombies; i++) spawnZombie(run, mode === 'first' ? 'mart-front' : 'mart');
    for (let i = 0; i < danger.streetZombies; i++) spawnZombie(run, 'street');
  }
  return run;
}

export function playerSpeed(run) {
  const weight = 1 - WEIGHT_PENALTY_PER_SLOT * run.inventory.used;
  const injury = 1 - INJURY_SPEED_PENALTY * Math.min(2, run.playerHealth);
  return PLAYER_SPEED * weight * injury;
}

export function nearestShelf(run) {
  let best = null;
  let bestDist = PICK_RANGE;
  for (const shelf of SHELVES) {
    const d = dist(run.player, shelf);
    if (d <= bestDist) {
      best = shelf;
      bestDist = d;
    }
  }
  return best;
}

/** 집기 전에 보여줄 정보: 필요한 칸 수, 남은 칸, 집는 시간 */
export function pickupPreview(run) {
  const shelf = nearestShelf(run);
  if (!shelf) return null;
  const item = ITEMS[shelf.itemId];
  const stock = run.martStock[shelf.id] ?? 0;
  return {
    shelf,
    item,
    stock,
    need: item.slots,
    free: run.inventory.free,
    canFit: run.inventory.canAdd(item.id),
    seconds: item.slots * PICKUP_SECONDS_PER_SLOT,
  };
}

function toast(run, text, tone = 'info') {
  run.toasts.push({ text, tone, ttl: 2.2 });
  if (run.toasts.length > 4) run.toasts.shift();
}

function tryStartPickup(run) {
  if (run.pickup) return;
  const preview = pickupPreview(run);
  if (!preview) return;
  const { shelf, item, stock, need, free, canFit, seconds } = preview;
  if (stock <= 0) {
    toast(run, `${item.name} 선반이 비었다`, 'warn');
    return;
  }
  if (!canFit) {
    toast(run, `칸이 부족하다: ${item.name}에는 ${need}칸 필요 (남은 칸 ${free})`, 'warn');
    return;
  }
  run.pickup = { shelfId: shelf.id, itemId: item.id, t: 0, duration: seconds };
}

function completePickup(run) {
  const { shelfId, itemId } = run.pickup;
  run.pickup = null;
  if ((run.martStock[shelfId] ?? 0) <= 0 || !run.inventory.add(itemId)) {
    toast(run, '물건을 집지 못했다', 'warn');
    return;
  }
  run.martStock[shelfId] -= 1;
  run.picked.push(itemId);
  toast(run, `${josa(ITEMS[itemId].name, '을/를')} 챙겼다 (${ITEMS[itemId].slots}칸)`, 'good');
}

/** 가방의 index번째 물품을 내려놓는다. 마트 안이면 선반에 되돌리고, 밖이면 길에 버린다. */
export function dropItem(run, index) {
  const itemId = run.inventory.removeAt(index);
  if (!itemId) return null;
  if (inMart(run.player)) {
    const shelf = SHELVES.find((s) => s.itemId === itemId);
    run.martStock[shelf.id] = (run.martStock[shelf.id] ?? 0) + 1;
    toast(run, `${josa(ITEMS[itemId].name, '을/를')} 선반에 되돌려 놓았다`);
  } else {
    run.dropped.push(itemId);
    toast(run, `${josa(ITEMS[itemId].name, '을/를')} 길에 버렸다`, 'warn');
  }
  return itemId;
}

/**
 * dt초만큼 진행한다.
 * input: { mx, my: 이동 방향(-1~1), interact: 이번 단계에 줍기 키를 눌렀는지, drop: 내려놓을 가방 칸 index }
 */
export function stepRun(run, dt, input = {}) {
  if (run.outcome) return run;
  run.elapsed += dt;
  run.timeLeft = Math.max(0, run.duration - run.elapsed);
  for (const t of run.toasts) t.ttl -= dt;
  run.toasts = run.toasts.filter((t) => t.ttl > 0);

  if (input.drop != null) dropItem(run, input.drop);

  let mx = input.mx || 0;
  let my = input.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const moving = len > 0.05;

  if (input.interact) tryStartPickup(run);
  if (run.pickup) {
    if (moving) {
      toast(run, '움직여서 줍기를 멈췄다', 'warn');
      run.pickup = null;
    } else {
      run.pickup.t += dt;
      if (run.pickup.t >= run.pickup.duration) completePickup(run);
    }
  }
  if (!run.pickup && moving) {
    const speed = playerSpeed(run);
    moveCircle(run.player, mx * speed * dt, my * speed * dt);
    run.player.faceX = mx;
    run.player.faceY = my;
  }

  if (!run.enteredMart && inMart(run.player)) run.enteredMart = true;

  // 추가 보급은 집 문 바로 바깥(도착 구역 밖)에서 시작하므로, 도착 구역에 들어오는 순간이 곧 귀가다.
  if (inRect(run.player, HOME_ZONE)) {
    run.outcome = 'home';
    return run;
  }

  if (run.zombiesEnabled) {
    updateZombies(run, dt);
    if (run.outcome) return run;
  }

  if (run.timeLeft <= 0) run.outcome = 'timeout';
  return run;
}

// ── 좀비 ───────────────────────────────────────

function randomPoint(run, area, minDistance) {
  const { rng } = run;
  for (let attempt = 0; attempt < 60; attempt++) {
    let p;
    if (area === 'mart') {
      p = { x: rng.float(MART_INNER.x + 16, MART_INNER.x + MART_INNER.w - 16), y: rng.float(MART_INNER.y + 16, MART_INNER.y + MART_INNER.h - 16) };
    } else if (area === 'mart-front') {
      // 첫 보급: 입구 쪽 통로에서 어슬렁거린다
      p = { x: rng.float(470, MART_INNER.x + MART_INNER.w - 16), y: rng.float(MART_INNER.y + 16, MART_INNER.y + MART_INNER.h - 16) };
    } else if (area === 'edge') {
      p = { x: rng.float(STREET.x, STREET.x + STREET.w), y: rng.chance(0.5) ? STREET.y : STREET.y + STREET.h };
    } else {
      p = { x: rng.float(STREET.x, STREET.x + STREET.w), y: rng.float(STREET.y, STREET.y + STREET.h) };
    }
    if (collides(p.x, p.y, ZOMBIE_RADIUS + 2)) continue;
    if (dist(p, run.player) < minDistance) continue;
    if (inRect(p, HOME_ZONE) || dist(p, HOME_DOOR) < 260) continue;
    return p;
  }
  return null;
}

export function spawnZombie(run, area, at = null) {
  const minDistance = area === 'street' || area === 'edge' ? 380 : 300;
  const p = at ?? randomPoint(run, area, minDistance);
  if (!p) return null;
  const { rng, danger } = run;
  const zombie = {
    id: run.nextZombieId++,
    x: p.x,
    y: p.y,
    r: ZOMBIE_RADIUS,
    speed: rng.float(danger.speedMin, danger.speedMax),
    phase: rng.float(0, Math.PI * 2),
    wobble: rng.float(1.2, 2.4),
    stuck: 0,
    detour: 0,
    detourX: 0,
    detourY: 0,
    chasing: false,
    wanderX: p.x,
    wanderY: p.y,
    wanderTimer: 0,
  };
  run.zombies.push(zombie);
  return zombie;
}

function nearDoor(z, door) {
  const { gap } = door;
  if (gap.w < gap.h) {
    // 세로로 뚫린 문(정문): y가 문 폭 안에 있고 x가 가까울 때
    return z.y > gap.y + z.r && z.y < gap.y + gap.h - z.r && Math.abs(z.x - (gap.x + gap.w / 2)) < 60;
  }
  return z.x > gap.x + z.r && z.x < gap.x + gap.w - z.r && Math.abs(z.y - (gap.y + gap.h / 2)) < 60;
}

/** 마트 안팎이 다르면 가장 가까운 출입구를 거쳐 쫓아온다. */
function chaseTarget(z, player) {
  const zIn = inMart(z);
  if (zIn === inMart(player)) return player;
  let best = null;
  let bestCost = Infinity;
  for (const door of MART_DOORS) {
    const near = zIn ? door.inside : door.outside;
    const cost = dist(z, near) + dist(door.outside, player) + dist(door.inside, player) * 0.01;
    if (cost < bestCost) {
      bestCost = cost;
      best = door;
    }
  }
  if (nearDoor(z, best)) return zIn ? best.outside : best.inside;
  return zIn ? best.inside : best.outside;
}

function updateZombies(run, dt) {
  run.spawnTimer -= dt;
  if (run.spawnTimer <= 0) {
    run.spawnTimer += run.danger.spawnInterval;
    if (run.zombies.length < run.danger.maxZombies) spawnZombie(run, 'edge');
  }

  const { player } = run;
  const sight = zombieSight(run);
  for (const z of run.zombies) {
    if (!z.chasing) {
      if (noticesPlayer(run, z, sight)) z.chasing = true;
    } else if (dist(z, player) > sight * LOSE_SIGHT_FACTOR) {
      z.chasing = false;
    }

    let dx;
    let dy;
    let speed = z.speed;
    if (z.detour > 0) {
      z.detour -= dt;
      dx = z.detourX;
      dy = z.detourY;
    } else {
      let target;
      if (z.chasing) {
        target = chaseTarget(z, player);
      } else {
        // 어슬렁거리기
        z.wanderTimer -= dt;
        if (z.wanderTimer <= 0 || Math.hypot(z.wanderX - z.x, z.wanderY - z.y) < 8) {
          z.wanderX = z.x + run.rng.float(-150, 150);
          z.wanderY = z.y + run.rng.float(-150, 150);
          z.wanderTimer = run.rng.float(2, 4);
        }
        target = { x: z.wanderX, y: z.wanderY };
        speed *= WANDER_SPEED_FACTOR;
      }
      const angle = Math.atan2(target.y - z.y, target.x - z.x) + Math.sin(run.elapsed * z.wobble + z.phase) * 0.3;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    }
    const step = speed * dt;
    const bx = z.x;
    const by = z.y;
    moveCircle(z, dx * step, dy * step);
    if (Math.hypot(z.x - bx, z.y - by) < step * 0.3) {
      z.stuck += dt;
      if (z.stuck > 0.4) {
        // 벽에 막히면 잠깐 옆으로 비켜 돌아간다
        const side = run.rng.chance(0.5) ? 1 : -1;
        z.detourX = -dy * side;
        z.detourY = dx * side;
        z.detour = run.rng.float(0.4, 0.9);
        z.stuck = 0;
      }
    } else {
      z.stuck = Math.max(0, z.stuck - dt);
    }
  }

  // 좀비끼리 겹치지 않게 살짝 밀어낸다
  const zs = run.zombies;
  for (let i = 0; i < zs.length; i++) {
    for (let j = i + 1; j < zs.length; j++) {
      const a = zs[i];
      const b = zs[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const overlap = a.r + b.r - d;
      if (overlap > 0 && d > 0.001) {
        const nx = (a.x - b.x) / d;
        const ny = (a.y - b.y) / d;
        moveCircle(a, (nx * overlap) / 2, (ny * overlap) / 2);
        moveCircle(b, (-nx * overlap) / 2, (-ny * overlap) / 2);
      }
    }
  }

  for (const z of zs) {
    if (dist(z, player) < z.r + player.r - 2) {
      run.outcome = 'caught';
      run.caughtBy = z.id;
      return;
    }
  }
}
