// 실시간 구간을 대신 플레이하는 봇(A* 경로 탐색). Node 테스트와 브라우저 E2E 검증에서 함께 쓴다.
// 게임 코드가 아니라 검증 도구다.
import { PICK_RANGE } from '../../src/core/constants.js';
import { ITEMS } from '../../src/core/items.js';
import { pickupPreview, playerSpeed } from '../../src/core/run.js';
import { HOME_ZONE, SHELVES, WORLD, collides, dist, moveCircle } from '../../src/core/world.js';

const CELL = 16;
const INFLATE = 17;
let cachedGrid = null;

export function buildGrid() {
  if (cachedGrid) return cachedGrid;
  const cols = Math.ceil(WORLD.w / CELL);
  const rows = Math.ceil(WORLD.h / CELL);
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (collides(c * CELL + CELL / 2, r * CELL + CELL / 2, INFLATE)) blocked[r * cols + c] = 1;
    }
  }
  cachedGrid = { cols, rows, blocked };
  return cachedGrid;
}

class Heap {
  constructor() {
    this.items = [];
  }
  push(node, priority) {
    const a = this.items;
    a.push([priority, node]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() {
    return this.items.length;
  }
}

function nearestOpenCell(grid, c, r) {
  for (let radius = 0; radius < 8; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= grid.cols || rr >= grid.rows) continue;
        if (!grid.blocked[rr * grid.cols + cc]) return [cc, rr];
      }
    }
  }
  return [c, r];
}

/** from → to 경로(점 목록). avoid: [{x, y, radius}] 근처 칸은 비용을 크게 매긴다. */
export function findPath(from, to, avoid = []) {
  const grid = buildGrid();
  const { cols, rows, blocked } = grid;
  const toCell = (p) => [Math.min(cols - 1, Math.max(0, Math.floor(p.x / CELL))), Math.min(rows - 1, Math.max(0, Math.floor(p.y / CELL)))];
  let [sc, sr] = toCell(from);
  if (blocked[sr * cols + sc]) [sc, sr] = nearestOpenCell(grid, sc, sr);
  let [gc, gr] = toCell(to);
  if (blocked[gr * cols + gc]) [gc, gr] = nearestOpenCell(grid, gc, gr);
  const start = sr * cols + sc;
  const goal = gr * cols + gc;

  const penalty = new Float32Array(cols * rows);
  for (const z of avoid) {
    const rad = Math.ceil(z.radius / CELL);
    const [zc, zr] = toCell(z);
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const c = zc + dc;
        const r = zr + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const d = Math.hypot(dc, dr) * CELL;
        if (d <= z.radius) penalty[r * cols + c] += (z.cost ?? 200) * (1 - d / z.radius) + 10;
      }
    }
  }

  const g = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const h = (i) => {
    const dc = Math.abs((i % cols) - gc);
    const dr = Math.abs(Math.floor(i / cols) - gr);
    return Math.max(dc, dr) + 0.414 * Math.min(dc, dr);
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, h(start));
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
  ];
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % cols;
    const cr = Math.floor(cur / cols);
    for (const [dc, dr, cost] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (blocked[ni] || closed[ni]) continue;
      if (dc && dr && (blocked[cr * cols + nc] || blocked[nr * cols + cc])) continue; // 모서리 끼임 방지
      const ng = g[cur] + cost + penalty[ni];
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        open.push(ni, ng + h(ni));
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return [to];
  const cells = [];
  for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push(i);
  cells.reverse();
  const points = cells.map((i) => ({ x: (i % cols) * CELL + CELL / 2, y: Math.floor(i / cols) * CELL + CELL / 2 }));
  points.push({ x: to.x, y: to.y });
  return smooth(from, points);
}

function clearLine(a, b) {
  const steps = Math.ceil(dist(a, b) / 6);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (collides(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, INFLATE - 1)) return false;
  }
  return true;
}

function smooth(from, points) {
  const out = [];
  let anchor = from;
  let i = 0;
  while (i < points.length) {
    let j = points.length - 1;
    while (j > i && !clearLine(anchor, points[j])) j -= 1;
    out.push(points[j]);
    anchor = points[j];
    i = j + 1;
  }
  return out;
}

/** 선반 앞에 설 자리: 선반 열의 좌우 통로 중 가까운 쪽 */
export function standPoint(shelf, from) {
  const { rack } = shelf;
  const left = { x: rack.x - 20, y: shelf.y };
  const right = { x: rack.x + rack.w + 20, y: shelf.y };
  const candidates = [left, right].filter((p) => !collides(p.x, p.y, 15));
  candidates.sort((a, b) => dist(a, from) - dist(b, from));
  return candidates[0];
}

export const HOME_TARGET = { x: HOME_ZONE.x + HOME_ZONE.w / 2, y: HOME_ZONE.y + HOME_ZONE.h / 2 };

/**
 * 계획(steps)을 차례로 수행하는 봇. 단계:
 *   { type: 'shelf', shelf }  선반에서 물건 집기
 *   { type: 'ground', id }    바닥의 가족·물건 데려가기
 *   { type: 'home' }          집 앞 도착 구역에 가서 가방 비우기
 *   { type: 'enter' }         집 앞에서 E — 문 잠그고 들어가기(탐색 종료)
 * 시간이 빠듯해지면 남은 계획을 버리고 집으로 들어간다.
 * next(run) 이 { mx, my, interact } 입력을 돌려준다.
 */
export class RunBot {
  constructor(
    plan,
    {
      avoidZombies = true,
      arriveDistance = 8,
      replanEvery = 0.25,
      chaseRadius = 70,
      wanderRadius = 60,
      predictRadius = 50,
      cost = 60,
      threatChase = 90,
      threatWander = 55,
      margin = 6,
    } = {},
  ) {
    Object.assign(this, { chaseRadius, wanderRadius, predictRadius, cost, threatChase, threatWander, margin });
    // 선반 id 문자열 목록도 받는다(그 뒤에 집으로 들어가기).
    this.steps = plan.map((step) =>
      typeof step === 'string' ? { type: 'shelf', shelf: SHELVES.find((s) => s.id === step) } : step,
    );
    if (!this.steps.some((s) => s.type === 'enter')) this.steps.push({ type: 'enter' });
    this.avoidZombies = avoidZombies;
    this.arriveDistance = arriveDistance;
    this.replanEvery = replanEvery;
    this.path = null;
    this.target = null;
    this.lastPlan = -Infinity;
    this.pickedCount = null;
    this.hurried = false;
  }

  currentStep(run) {
    while (this.steps.length) {
      const step = this.steps[0];
      let skip = false;
      if (step.type === 'shelf') {
        skip = (run.martStock[step.shelf.id] ?? 0) <= 0 || !run.inventory.canAdd(step.shelf.itemId);
      } else if (step.type === 'ground') {
        skip = !run.ground.some((g) => g.id === step.id) || !run.inventory.canAdd(step.id);
      } else if (step.type === 'home') {
        skip = run.inventory.isEmpty;
      }
      if (!skip) return step;
      this.steps.shift();
      this.path = null;
    }
    return { type: 'enter' };
  }

  next(run) {
    if (this.pickedCount == null) this.pickedCount = run.picked.length;
    if (run.picked.length !== this.pickedCount) {
      this.pickedCount = run.picked.length;
      if (['shelf', 'ground'].includes(this.steps[0]?.type)) this.steps.shift();
      this.path = null;
    }
    if (run.pickup) return { mx: 0, my: 0, interact: false };

    // 남은 시간이 집까지 가기 빠듯하면 바로 돌아간다(실제 경로 길이 기준, 0.5초마다 다시 잰다).
    if (this.homeEtaAt == null || run.elapsed - this.homeEtaAt >= 0.5) {
      const route = findPath(run.player, HOME_TARGET);
      let length = 0;
      let prev = run.player;
      for (const p of route) {
        length += dist(prev, p);
        prev = p;
      }
      this.homeEta = length / (playerSpeed(run) * 0.8);
      this.homeEtaAt = run.elapsed;
    }
    let step = this.currentStep(run);
    const pending =
      step.type === 'shelf' ? ITEMS[step.shelf.itemId].slots * 0.6 + 2 : step.type === 'ground' ? 3 : 0;
    if (!this.hurried && run.timeLeft < this.homeEta + pending + this.margin) this.hurried = true;
    if (this.hurried) step = { type: 'enter' };

    let target = HOME_TARGET;
    let ground = null;
    if (step.type === 'shelf') target = standPoint(step.shelf, run.player);
    if (step.type === 'ground') {
      ground = run.ground.find((g) => g.id === step.id);
      target = { x: ground.x, y: ground.y };
    }

    // 가까이 붙은 좀비가 있으면 우선 피한다.
    const threats = run.zombies
      .map((z) => ({ z, d: dist(z, run.player) }))
      .filter(({ z, d }) => d < (z.chasing ? this.threatChase : this.threatWander))
      .sort((a, b) => a.d - b.d);
    const safeToPick = !threats.some(({ z, d }) => z.chasing && d < 150);

    if (step.type === 'shelf' && dist(run.player, target) <= this.arriveDistance && safeToPick) {
      const preview = pickupPreview(run);
      if (preview?.shelf?.id === step.shelf.id && dist(run.player, step.shelf) <= PICK_RANGE) return { mx: 0, my: 0, interact: true };
    }
    if (step.type === 'ground' && dist(run.player, ground) <= this.arriveDistance + 16 && safeToPick) {
      const preview = pickupPreview(run);
      if (preview?.target.ground === ground) return { mx: 0, my: 0, interact: true };
    }
    if (step.type === 'home' && run.atHome && run.inventory.isEmpty) {
      this.steps.shift();
      return { mx: 0, my: 0, interact: false };
    }
    if (step.type === 'enter' && run.atHome) return { mx: 0, my: 0, interact: true };

    const needPlan =
      !this.path ||
      this.target !== target.x * 10000 + target.y ||
      run.elapsed - this.lastPlan >= this.replanEvery ||
      !this.path.length;
    if (needPlan) {
      const avoid = this.avoidZombies
        ? run.zombies.flatMap((z) => {
            const spots = [{ x: z.x, y: z.y, radius: z.chasing ? this.chaseRadius : this.wanderRadius, cost: this.cost }];
            if (z.chasing) {
              // 0.6초 뒤 위치도 피한다
              const d = dist(z, run.player) || 1;
              spots.push({
                x: z.x + ((run.player.x - z.x) / d) * z.speed * 0.6,
                y: z.y + ((run.player.y - z.y) / d) * z.speed * 0.6,
                radius: this.predictRadius,
                cost: this.cost,
              });
            }
            return spots;
          })
        : [];
      this.path = findPath(run.player, target, avoid);
      this.target = target.x * 10000 + target.y;
      this.lastPlan = run.elapsed;
    }
    while (this.path.length > 1 && dist(run.player, this.path[0]) < 10) this.path.shift();
    const wp = this.path[0] ?? target;
    let dx = wp.x - run.player.x;
    let dy = wp.y - run.player.y;
    let d = Math.hypot(dx, dy);
    if (d < 2 && !threats.length) return { mx: 0, my: 0, interact: false };
    if (d >= 2) {
      dx /= d;
      dy /= d;
    } else {
      dx = dy = 0;
    }
    if (this.avoidZombies && threats.length) {
      const escape = this.bestEscape(run, dx, dy);
      if (escape) {
        dx = escape.x;
        dy = escape.y;
      }
    }
    return { mx: dx, my: dy, interact: false };
  }
}

/** 16방향으로 0.4초씩 움직여 보고, 좀비와의 거리·막다른 곳 여부·목표 방향을 따져 가장 나은 방향을 고른다. */
RunBot.prototype.bestEscape = function bestEscape(run, wantX, wantY) {
  const speed = playerSpeed(run);
  const horizon = 0.45;
  const sub = 5;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const probe = { x: run.player.x, y: run.player.y, r: run.player.r };
    for (let k = 0; k < sub; k++) moveCircle(probe, (ux * speed * horizon) / sub, (uy * speed * horizon) / sub);
    let clearance = Infinity;
    for (const z of run.zombies) {
      const d0 = dist(z, probe) || 1;
      const reach = z.chasing ? z.speed * horizon : z.speed * 0.35 * horizon;
      const zd = Math.max(0, d0 - reach);
      clearance = Math.min(clearance, zd);
    }
    // 막다른 곳 회피: 도착 지점에서 사방으로 얼마나 트여 있는지
    let open = 0;
    for (let j = 0; j < 8; j++) {
      const b = (j / 8) * Math.PI * 2;
      if (!collides(probe.x + Math.cos(b) * 40, probe.y + Math.sin(b) * 40, probe.r)) open += 1;
    }
    const moved = Math.hypot(probe.x - run.player.x, probe.y - run.player.y);
    const progress = (probe.x - run.player.x) * wantX + (probe.y - run.player.y) * wantY;
    const score = Math.min(clearance, 160) * 1.0 + open * 6 + progress * 0.25 + moved * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = { x: ux, y: uy };
    }
  }
  return best;
};

/**
 * 여러 번 오가는 계획을 만든다. legs: [['radio', 'water'], ['dad'], ['mom', 'sis'], ...]
 * 각 묶음을 집은 뒤 집에 내려놓고, 마지막에 집으로 들어간다. 가족 id는 바닥에서 데려간다.
 */
export function scramblePlan(legs, martStock) {
  const remaining = { ...martStock };
  const steps = [];
  for (const leg of legs) {
    for (const id of leg) {
      if (['dad', 'mom', 'sis'].includes(id)) {
        steps.push({ type: 'ground', id });
        continue;
      }
      const shelf = SHELVES.find((s) => s.itemId === id && remaining[s.id] > 0);
      if (!shelf) continue;
      remaining[shelf.id] -= 1;
      steps.push({ type: 'shelf', shelf });
    }
    steps.push({ type: 'home' });
  }
  steps.push({ type: 'enter' });
  return steps;
}

/** 물품 id 목록 → 그 물품이 남아 있는 선반 id 목록 */
export function shelvesFor(itemIds, martStock) {
  const remaining = { ...martStock };
  const out = [];
  for (const itemId of itemIds) {
    const shelf = SHELVES.find((s) => s.itemId === itemId && remaining[s.id] > 0);
    if (!shelf) continue;
    remaining[shelf.id] -= 1;
    out.push(shelf.id);
  }
  return out;
}
