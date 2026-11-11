// 60초 탐색 시뮬레이션: 마트와 집을 오가며 물자와 가족을 집으로 옮긴다.
// DOM과 무관한 순수 로직이라 테스트에서 그대로 돌릴 수 있다.
//
// - 집 앞 도착 구역에 들어가면 가방 속 물품·가족을 집에 내려놓고, 시간은 계속 흐른다.
// - 도착 구역에서 E를 누르면 집에 들어가 문을 잠근다(탐색 종료).
// - 60초가 끝날 때 도착 구역 안에 있으면 무사, 밖에 있으면 패배.
import {
  INJURY_SPEED_PENALTY,
  PICK_RANGE,
  PICKUP_SECONDS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RUN_SECONDS,
  WEIGHT_PENALTY_PER_SLOT,
  ZOMBIE_RADIUS,
} from './constants.js';
import { DIFFICULTIES } from './difficulty.js';
import { carryInfo, isPerson } from './inventory.js';
import { josa } from './text.js';
import {
  HOME_DOOR,
  HOME_ZONE,
  MART_DOORS,
  MART_INNER,
  SHELVES,
  SOLIDS,
  START,
  STREET,
  collides,
  dist,
  inMart,
  inRect,
  lineOfSight,
  moveCircle,
} from './world.js';

/** 좀비 수·속도·시야의 기준값(하드). 실제 값은 난이도(difficulty.js)가 정한다. */
export const RUN_DANGER = DIFFICULTIES.hard.run;

export const HEARING_FACTOR = 0.6; // 물건을 집는 동안은 시야의 이 비율 안에서는 벽 너머로도 소리를 듣는다
export const SIGHT_GROWTH_PER_SECOND = 2; // 시간이 흐를수록 좀비 떼가 더 넓게 몰려든다
export const LOSE_SIGHT_FACTOR = 1.5; // 쫓던 좀비는 시야의 이 배수만큼 멀어져야 놓친다
export const WANDER_SPEED_FACTOR = 0.35;
export const SCATTER_RADIUS = 300; // 문간에 들어서면 이 거리 안의 좀비가 흥미를 잃고 흩어진다
export const SCATTER_SECONDS = 2.5; // 흩어지는 동안에는 다시 알아채지 못한다

// 좀비는 집 앞 도착 구역(문간)에 들어오지 못한다.
const ZOMBIE_SOLIDS = [...SOLIDS, HOME_ZONE];

/** 지금 이 순간 좀비의 시야 반경 */
export function zombieSight(run) {
  return run.danger.sight + run.elapsed * SIGHT_GROWTH_PER_SECOND;
}

/** 쫓고 있지 않던 좀비가 플레이어를 알아채는지: 시야 안 + 가리는 것 없음, 또는 물건 집는 소리 */
export function noticesPlayer(run, z, sight = zombieSight(run)) {
  if (run.atHome) return false;
  const d = dist(z, run.player);
  if (d > sight) return false;
  if (run.pickup && d <= sight * HEARING_FACTOR) return true;
  return lineOfSight(z, run.player);
}

/**
 * family: 집 주변에 흩어진 가족 [{ id, x, y }] — 바닥에 놓인 '주울 것'으로 시작한다.
 */
export function createRun({ inventory, martStock, rng, family = [], playerHealth = 0, zombies = true, danger = null }) {
  const d = { ...RUN_DANGER, ...danger };
  const run = {
    danger: d,
    duration: RUN_SECONDS,
    elapsed: 0,
    timeLeft: RUN_SECONDS,
    outcome: null, // 'home' | 'caught' | 'timeout'
    endedBy: null, // 'enter'(스스로 집에 들어감) | 'time'(시간이 끝날 때 집 앞에 있었음)
    player: { x: START.x, y: START.y, r: PLAYER_RADIUS, faceX: 1, faceY: 0 },
    playerHealth,
    zombies: [],
    nextZombieId: 1,
    spawnTimer: d.spawnInterval,
    pickup: null, // { target, id, t, duration }
    toasts: [],
    picked: [],
    ground: family.map((f) => ({ uid: `family-${f.id}`, id: f.id, x: f.x, y: f.y })),
    nextGroundId: 1,
    delivered: [], // 집에 들여놓은 것(물품 id·가족 id), 들여놓은 순서
    atHome: false,
    inventory,
    martStock,
    rng,
    zombiesEnabled: zombies,
  };
  if (zombies) {
    for (let i = 0; i < d.martZombies; i++) spawnZombie(run, 'mart-front');
    for (let i = 0; i < d.streetZombies; i++) spawnZombie(run, 'street');
  }
  return run;
}

export function playerSpeed(run) {
  const weight = 1 - WEIGHT_PENALTY_PER_SLOT * run.inventory.used;
  const injury = 1 - INJURY_SPEED_PENALTY * Math.min(2, run.playerHealth);
  return PLAYER_SPEED * weight * injury;
}

/** 가장 가까운 주울 것: 선반 또는 바닥(가족·내려놓은 물건) */
export function nearestPickup(run) {
  let best = null;
  let bestDist = PICK_RANGE;
  for (const shelf of SHELVES) {
    const d = dist(run.player, shelf);
    if (d <= bestDist) {
      best = { kind: 'shelf', shelf, id: shelf.itemId };
      bestDist = d;
    }
  }
  for (const g of run.ground) {
    const d = dist(run.player, g);
    if (d <= bestDist) {
      best = { kind: 'ground', ground: g, id: g.id };
      bestDist = d;
    }
  }
  return best;
}

/** 집기 전에 보여줄 정보: 필요한 칸 수, 남은 칸, 집는 시간 */
export function pickupPreview(run) {
  const target = nearestPickup(run);
  if (!target) return null;
  const info = carryInfo(target.id);
  const stock = target.kind === 'shelf' ? (run.martStock[target.shelf.id] ?? 0) : 1;
  return {
    target,
    shelf: target.shelf ?? null,
    item: info,
    stock,
    need: info.slots,
    free: run.inventory.free,
    canFit: run.inventory.canAdd(info.id),
    seconds: PICKUP_SECONDS,
  };
}

function toast(run, text, tone = 'info') {
  run.toasts.push({ text, tone, ttl: 2.4 });
  if (run.toasts.length > 4) run.toasts.shift();
}

function tryStartPickup(run) {
  if (run.pickup) return;
  const preview = pickupPreview(run);
  if (!preview) return;
  const { target, item, stock, need, free, canFit, seconds } = preview;
  if (stock <= 0) {
    toast(run, `${item.name} 선반이 비었다`, 'warn');
    return;
  }
  if (!canFit) {
    toast(run, `칸이 부족하다: ${item.name}에는 ${need}칸 필요 (남은 칸 ${free})`, 'warn');
    return;
  }
  run.pickup = { target, id: item.id, t: 0, duration: seconds };
}

function completePickup(run) {
  const { target, id } = run.pickup;
  run.pickup = null;
  const info = carryInfo(id);
  if (target.kind === 'shelf') {
    if ((run.martStock[target.shelf.id] ?? 0) <= 0 || !run.inventory.add(id)) {
      toast(run, '물건을 집지 못했다', 'warn');
      return;
    }
    run.martStock[target.shelf.id] -= 1;
  } else {
    const index = run.ground.indexOf(target.ground);
    if (index < 0 || !run.inventory.add(id)) {
      toast(run, '집지 못했다', 'warn');
      return;
    }
    run.ground.splice(index, 1);
  }
  run.picked.push(id);
  toast(
    run,
    info.kind === 'person' ? `${josa(info.name, '을/를')} 데리고 간다 (${info.slots}칸)` : `${josa(info.name, '을/를')} 챙겼다 (${info.slots}칸)`,
    'good',
  );
}

/** 가방의 index번째를 내려놓는다. 물품은 마트 안이면 선반으로, 밖이면 바닥에. 가족은 그 자리에 기다린다. */
export function dropItem(run, index) {
  const id = run.inventory.removeAt(index);
  if (!id) return null;
  const info = carryInfo(id);
  if (!isPerson(id) && inMart(run.player)) {
    const shelf = SHELVES.find((s) => s.itemId === id);
    run.martStock[shelf.id] = (run.martStock[shelf.id] ?? 0) + 1;
    toast(run, `${josa(info.name, '을/를')} 선반에 되돌려 놓았다`);
  } else {
    run.ground.push({ uid: `drop-${run.nextGroundId++}`, id, x: run.player.x, y: run.player.y });
    toast(run, isPerson(id) ? `${info.name}에게 여기서 기다리라고 했다` : `${josa(info.name, '을/를')} 내려놓았다 · 다시 주울 수 있다`, 'warn');
  }
  return id;
}

/** 가방 속 물품·가족을 모두 집에 들여놓는다. */
function deliverAll(run) {
  if (run.inventory.isEmpty) return [];
  const ids = run.inventory.takeAll();
  run.delivered.push(...ids);
  toast(run, `집에 들여놓았다: ${ids.map((id) => carryInfo(id).name).join(', ')}`, 'good');
  return ids;
}

/**
 * dt초만큼 진행한다.
 * input: { mx, my: 이동 방향(-1~1), interact: 이번 단계에 E를 눌렀는지, drop: 내려놓을 가방 칸 index }
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

  if (input.interact) {
    if (run.atHome && !run.pickup && !pickupPreview(run)) {
      deliverAll(run);
      run.outcome = 'home';
      run.endedBy = 'enter';
      return run;
    }
    tryStartPickup(run);
  }
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

  const wasHome = run.atHome;
  run.atHome = inRect(run.player, HOME_ZONE);
  if (run.atHome && !wasHome) scatterZombies(run);
  if (run.atHome && !run.pickup) deliverAll(run);

  if (run.zombiesEnabled) {
    updateZombies(run, dt);
    if (run.outcome) return run;
  }

  if (run.timeLeft <= 0) {
    if (run.atHome) {
      deliverAll(run);
      run.outcome = 'home';
      run.endedBy = 'time';
    } else {
      run.outcome = 'timeout';
    }
  }
  return run;
}

// ── 좀비 ───────────────────────────────────────

/** 문간에 들어서면 집 근처 좀비가 먹잇감을 놓치고 흩어진다. 다시 나갈 틈이 생긴다. */
function scatterZombies(run) {
  for (const z of run.zombies) {
    z.chasing = false;
    const d = dist(z, HOME_DOOR);
    if (d > SCATTER_RADIUS) continue;
    const away = Math.atan2(z.y - HOME_DOOR.y, z.x - HOME_DOOR.x) + run.rng.float(-0.5, 0.5);
    z.scatter = SCATTER_SECONDS;
    z.detour = SCATTER_SECONDS;
    z.detourX = Math.cos(away);
    z.detourY = Math.sin(away);
  }
}

function randomPoint(run, area, minDistance) {
  const { rng } = run;
  for (let attempt = 0; attempt < 60; attempt++) {
    let p;
    if (area === 'mart-front') {
      p = { x: rng.float(470, MART_INNER.x + MART_INNER.w - 16), y: rng.float(MART_INNER.y + 16, MART_INNER.y + MART_INNER.h - 16) };
    } else if (area === 'edge') {
      p = { x: rng.float(STREET.x, STREET.x + STREET.w), y: rng.chance(0.5) ? STREET.y : STREET.y + STREET.h };
    } else {
      p = { x: rng.float(STREET.x, STREET.x + STREET.w), y: rng.float(STREET.y, STREET.y + STREET.h) };
    }
    if (collides(p.x, p.y, ZOMBIE_RADIUS + 2, ZOMBIE_SOLIDS)) continue;
    if (dist(p, run.player) < minDistance) continue;
    if (dist(p, HOME_DOOR) < 260) continue;
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
    scatter: 0,
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
    if (z.scatter > 0) {
      z.scatter -= dt;
    } else if (!z.chasing) {
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
    moveCircle(z, dx * step, dy * step, ZOMBIE_SOLIDS);
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
        moveCircle(a, (nx * overlap) / 2, (ny * overlap) / 2, ZOMBIE_SOLIDS);
        moveCircle(b, (-nx * overlap) / 2, (-ny * overlap) / 2, ZOMBIE_SOLIDS);
      }
    }
  }

  // 집 문간(도착 구역)에 들어선 사람은 잡히지 않는다
  if (run.atHome) return;
  for (const z of zs) {
    if (dist(z, player) < z.r + player.r - 2) {
      run.outcome = 'caught';
      run.caughtBy = z.id;
      return;
    }
  }
}
