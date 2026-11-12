// 게임 전체 흐름: 80초 탐색(물자·가족을 집으로) → 하루 단위 생존(사건·배급·탐사) → 결말.
// 화면(DOM)과 분리되어 있어 테스트에서 그대로 조작할 수 있다.
import {
  EXPEDITION_DAYS,
  RUN_SECONDS,
  HEALTH_DEATH,
  HUNGER_DEATH,
  HUNGER_WEAK,
  MOOD_BROKEN,
  MOOD_DEPRESSED,
  MOOD_LOW,
  THIRST_DEATH,
  THIRST_WEAK,
} from './constants.js';
import { DEFAULT_DIFFICULTY, difficultyOf } from './difficulty.js';
import { ENDINGS } from './endings.js';
import { CHAINS, EVENT_DEFS, MISSIONS, PATHS, RANDOM_EVENTS } from './events/index.js';
import { chainMissedNote } from './events/chains.js';
import { EventDirector } from './events/director.js';
import { rollNightEvent } from './events/night.js';
import { expeditionRisk, rollItems, rollLoot } from './expedition.js';
import { Inventory, isPerson } from './inventory.js';
import { itemSummary, mealLines, morningStatus, nameList } from './journal.js';
import { SERVINGS, emptyStock, formatResources, ITEMS } from './items.js';
import {
  FAMILY_DEFS,
  PLAYER_DEF,
  createPerson,
  healthLabel,
  incapableReason,
  isCapable,
  isHome,
  moodLabel,
  needsFood,
  needsWater,
  MOOD_MAX,
} from './people.js';
import { Rng, randomSeed } from './rng.js';
import { createRun, stepRun } from './run.js';
import { josa } from './text.js';
import { MOVE_SECONDS, createMartMap, createMoveMap, initialMartStock, movingGoods } from './world.js';

const evaluate = (value, ...args) => (typeof value === 'function' ? value(...args) : value);

export class Game {
  constructor({ seed = randomSeed(), zombies = true, difficulty = DEFAULT_DIFFICULTY } = {}) {
    this.seed = seed;
    const root = new Rng(seed);
    this.rng = { schedule: root.fork('schedule'), outcome: root.fork('outcome'), run: root.fork('run') };
    this.zombies = zombies;
    this.difficulty = difficultyOf(difficulty);
    // 미션 등으로 생기는 지속 상태. dog: 떠돌이 개 보리와 함께 지냄, shortcut: 탐사 지름길을 앎
    // gangAnger: 약탈자 쪽지를 무시한 횟수, robes: 하얀 옷의 사람들이 찾아온 횟수
    // hordeDay: 좀비 떼가 지나갈 날, barricade: 그 전에 문과 창을 막았는지
    this.nightHistory = {}; // 밤사이 사건이 마지막으로 일어난 날
    this.pendingMove = null; // 이사 준비 중이면 { map, martStock, family, … }
    this.pendingMovePlace = null;
    this.moves = 0;
    this.nightEvents = true; // 밤사이 사건을 굴릴지(규칙을 떼어 검사할 때만 끈다)
    this.tripStreak = 0; // 쉬지 않고 이어 보낸 탐사 수
    this.restDays = 0; // 아무도 탐사를 나가 있지 않은 밤의 수(하룻밤마다 연속 탐사 피로가 하나 풀린다)
    this.flags = {
      dog: false,
      shortcut: false,
      gangAnger: 0,
      gangGone: false,
      robes: 0,
      robesGone: false,
      hordeDay: null,
      barricade: false,
      shelter: null, // 이사한 곳('bunker': 지하 방공호). null이면 처음 집
    };

    this.phase = 'ready'; // ready → run → home → ending
    this.day = 0;
    this.people = [createPerson(PLAYER_DEF, 'home'), ...FAMILY_DEFS.map((def) => createPerson(def, 'outside'))];
    this.stock = emptyStock();
    this.inventory = new Inventory();
    // 마트 선반에 무엇이 놓였는지는 시드마다 다르다
    this.martMap = createMartMap(root.fork('layout'));
    this.martStock = initialMartStock(this.martMap);

    this.run = null;
    this.lastRun = null;

    this.expedition = null; // { memberId, withWeapon, departDay, returnDay, risk }
    this.expeditions = 0; // 떠난 탐사 수(많을수록 위험)
    this.expeditionReport = null; // 오늘 아침 돌아온 탐사 결과
    this.director = new EventDirector({
      rng: this.rng.schedule,
      chains: CHAINS,
      randomEvents: RANDOM_EVENTS,
      chance: this.difficulty.eventChance,
    });
    this.event = null; // 지금 대응할(또는 방금 대응한) 사건
    this.eventQueue = []; // 오늘 이어서 일어날 사건
    this.resolvedToday = []; // 오늘 이미 대응한 사건(화면 표시용)
    this.reviveAt = null; // 탈출 경로가 모두 닫혔을 때, 하나가 다시 열리는 날
    this.revived = 0;
    this.rations = {};
    this.rationsTouched = false;
    this.momCaredToday = false;
    this.talkedToday = false;
    this.nightReport = [];
    this.log = [];
    this.journal = []; // 하루 한 쪽씩 쓰는 일지
    this.journalCursor = 0;
    this.ending = null;
    this.pendingWin = null;
    this.listeners = new Set();
  }

  // ── 공통 ─────────────────────────────────────

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  person(id) {
    return this.people.find((p) => p.id === id);
  }

  get me() {
    return this.person(PLAYER_DEF.id);
  }

  presentPeople() {
    return this.people.filter(isHome);
  }

  /** kind: scramble | event | event-start | action | morning | night | death (일지에 어떻게 적을지) */
  addLog(text, tone = 'info', kind = 'action', extra = {}) {
    this.log.push({ day: this.day, text, tone, kind, ...extra });
  }

  /** 일지의 새 쪽: 지난 쪽 이후에 일어난 일 + 오늘 아침 모습. 아침마다 한 번 쓴다. */
  writePage() {
    const entries = this.pendingEntries();
    this.journalCursor = this.log.length;
    this.journal.push({ day: this.day, entries, status: morningStatus(this) });
  }

  /** 아직 일지에 옮겨 적지 않은 일(오늘 낮에 일어난 일, 또는 마지막 날의 일). */
  pendingEntries() {
    return this.log.slice(this.journalCursor).filter((e) => e.kind !== 'event-start');
  }

  // ── 80초 탐색 ────────────────────────────────

  /** 곧 시작할 실시간 구간(시작 전 화면에 보여 줄 지도·재고·가족 자리·제한 시간) */
  upcomingRun() {
    if (this.pendingMove) return this.pendingMove;
    return {
      kind: 'mart',
      map: this.martMap,
      martStock: this.martStock,
      family: FAMILY_DEFS.map((def) => ({ id: def.id, ...this.martMap.familySpots[def.id] })),
      duration: RUN_SECONDS,
    };
  }

  /** 시작 화면에서 카운트다운을 누르면: 처음 80초 또는 이사 */
  startRun() {
    if (this.pendingMove) return this.startMoveRun();
    return this.startFirstRun();
  }

  startFirstRun() {
    if (this.phase !== 'ready' || this.pendingMove) return false;
    this.run = createRun({
      inventory: this.inventory,
      martStock: this.martStock,
      rng: this.rng.run,
      playerHealth: this.me.health,
      family: FAMILY_DEFS.map((def) => ({ id: def.id, ...this.martMap.familySpots[def.id] })),
      map: this.martMap,
      zombies: this.zombies,
      danger: this.difficulty.run,
    });
    this.phase = 'run';
    this.emit();
    return true;
  }

  /** 실시간 구간을 dt초 진행한다. 결과가 나면 다음 단계로 넘어간다. */
  stepRun(dt, input) {
    if (this.phase !== 'run' || !this.run) return;
    stepRun(this.run, dt, input);
    if (this.run.outcome) this.finishRun();
  }

  // ── 이사(다른 곳으로 옮기기) ─────────────────────

  /** 사건에서 이사하기로 하면: 짐을 가구 위에 쌓아 두고 이사 지도를 준비한다(카운트다운은 아직). */
  prepareMove(place = 'bunker') {
    const goods = movingGoods(this.stock, SERVINGS);
    const map = createMoveMap({ goods, rng: this.rng.run });
    const movers = this.presentPeople().filter((p) => !p.isPlayer);
    this.pendingMove = {
      kind: 'move',
      place,
      map,
      martStock: initialMartStock(map),
      family: movers.map((p) => ({ id: p.id, ...map.familySpots[p.id] })),
      familyIds: movers.map((p) => p.id),
      duration: MOVE_SECONDS,
      oldStock: { ...this.stock },
    };
    this.phase = 'ready';
  }

  startMoveRun() {
    const move = this.pendingMove;
    if (this.phase !== 'ready' || !move) return false;
    this.inventory.takeAll();
    for (const id of move.familyIds) this.person(id).status = 'outside';
    this.run = createRun({
      kind: 'move',
      map: move.map,
      duration: move.duration,
      inventory: this.inventory,
      martStock: { ...move.martStock },
      rng: this.rng.run,
      playerHealth: this.me.health,
      family: move.family,
      zombies: this.zombies,
      danger: this.difficulty.run,
    });
    this.run.familyIds = move.familyIds;
    this.phase = 'run';
    this.emit();
    return true;
  }

  /** 이사가 끝났을 때: 옮긴 것만 남고, 못 옮긴 짐은 잃고, 데려오지 못한 식구는 남겨진다. */
  finishMove(run) {
    const move = this.pendingMove;
    this.pendingMove = null;
    this.run = null;
    this.inventory.takeAll();
    const items = this.lastRun.items;
    if (run.outcome !== 'home') {
      for (const id of move.familyIds) this.person(id).status = 'home';
      const text =
        run.outcome === 'timeout'
          ? `이삿짐을 나르다 시간이 다 됐다. 방공호 철문이 등 뒤에서 닫히는 소리를 들었다. 거리의 좀비들이 사방에서 몰려들었다.`
          : `이삿짐을 나르다 좀비에게 붙잡혔다. 방공호까지 몇 걸음이 남아 있었다.`;
      this.setEnding(run.outcome, { text });
      return;
    }
    const old = move.oldStock;
    const stock = emptyStock();
    const cans = items.filter((id) => id === 'canned').length;
    const bottles = items.filter((id) => id === 'water').length;
    stock.food = Math.min(old.food, cans * SERVINGS);
    stock.water = Math.min(old.water, bottles * SERVINGS);
    for (const id of items) {
      if (id === 'canned' || id === 'water') continue;
      for (const [key, n] of Object.entries(ITEMS[id].gives)) stock[key] += n;
    }
    const lostStock = {};
    for (const key of Object.keys(stock)) if (old[key] > stock[key]) lostStock[key] = old[key] - stock[key];
    this.stock = stock;
    const brought = [];
    const left = [];
    for (const id of move.familyIds) {
      const p = this.person(id);
      if (this.lastRun.family.includes(id)) {
        p.status = 'home';
        brought.push(p.name);
      } else {
        p.status = 'left';
        p.fate = '이사하던 날 데려오지 못했다.';
        left.push(p.name);
      }
    }
    this.flags.shelter = move.place;
    this.flags.gangAnger = 0; // 약탈자들은 새 은신처를 모른다
    this.flags.hordeDay = null;
    this.moves += 1;
    const lostText = formatResources(lostStock);
    this.addLog(
      `${run.duration}초 동안 짐을 날랐다. ${run.endedBy === 'enter' ? `${Math.max(1, Math.round(run.timeLeft))}초를 남기고` : '시간이 다 된 순간'} 방공호 철문을 닫았다.${
        lostText ? ` 옛집에 두고 온 것: ${lostText}.` : ' 짐은 하나도 남기지 않고 옮겼다.'
      }`,
      lostText ? 'warn' : 'good',
      'action',
    );
    if (left.length) this.addLog(`${josa(nameList(left), '을/를')} 데려오지 못했다. 옛집에 남아 있을지도 모른다.`, 'bad', 'action');
    else if (brought.length) this.addLog('식구 모두 방공호로 옮겨 왔다.', 'good', 'action');
    if (this.flags.dog) this.addLog('보리는 누구보다 먼저 방공호 계단을 뛰어 내려갔다.', 'good', 'action');
    this.phase = 'home';
    this.syncRations();
  }

  finishRun() {
    const run = this.run;
    const items = run.delivered.filter((id) => !isPerson(id));
    const family = run.delivered.filter(isPerson);
    this.lastRun = {
      kind: run.kind,
      outcome: run.outcome,
      endedBy: run.endedBy,
      delivered: [...run.delivered],
      items,
      family,
      timeLeft: run.timeLeft,
      elapsed: run.elapsed,
      duration: run.duration,
    };
    if (run.kind === 'move') {
      this.finishMove(run);
      this.emit();
      return;
    }
    if (run.outcome !== 'home') {
      this.setEnding(run.outcome);
      this.emit();
      return;
    }
    // 집에 들여놓은 물품은 재고로, 가족은 집 안으로. 데려오지 못한 가족은 남겨진다.
    for (const id of items) {
      for (const [key, n] of Object.entries(ITEMS[id].gives)) this.stock[key] += n;
    }
    for (const p of this.people) {
      if (p.status !== 'outside') continue;
      p.status = family.includes(p.id) ? 'home' : 'left';
      if (p.status === 'left') p.fate = `${run.duration}초 안에 데려오지 못했다.`;
    }
    this.inventory.takeAll();
    this.run = null;
    const summary = itemSummary(items);
    const opening =
      run.endedBy === 'enter'
        ? `${run.duration}초. ${Math.max(1, Math.round(run.timeLeft))}초를 남기고 문을 걸어 잠갔다.`
        : `${run.duration}초가 끝나는 순간, 간신히 집 문간에 닿았다.`;
    this.addLog(`${opening} ${summary ? `마트에서 들고 온 것: ${summary}.` : '마트에서는 아무것도 들고 오지 못했다.'}`, 'good', 'scramble');
    const brought = this.people.filter((p) => family.includes(p.id)).map((p) => p.name);
    const left = this.people.filter((p) => p.status === 'left').map((p) => p.name);
    if (brought.length === FAMILY_DEFS.length) this.addLog('가족 모두 무사히 집 안으로 데려왔다.', 'good', 'scramble');
    else if (brought.length) this.addLog(`${josa(nameList(brought), '을/를')} 데리고 들어왔다.`, 'good', 'scramble');
    if (left.length) this.addLog(`${josa(nameList(left), '을/를')} 끝내 데려오지 못했다. 어딘가에서 무사하기를 빈다.`, 'warn', 'scramble');
    this.phase = 'home';
    this.day = 1;
    this.startDay();
    this.emit();
  }

  // ── 탐사 ─────────────────────────────────────

  /** 화면에는 보여 주지 않는 내부 위험도 */
  expeditionRisk(memberId, withWeapon = false) {
    const scale = this.difficulty.expedition.risk * (this.flags.shortcut ? 0.7 : 1);
    return expeditionRisk(this.person(memberId), { withWeapon, count: this.expeditions, scale, streak: this.nextTripStreak() });
  }

  /**
   * 지금 탐사를 보내면 몇 번째 '연속' 탐사가 되는지. 아무도 나가 있지 않은 밤을 하루 보낼 때마다 하나씩 풀린다.
   * 1이면 충분히 쉰 뒤의 탐사, 2 이상이면 쉬지 않고 연달아 보내는 탐사다.
   */
  nextTripStreak() {
    return Math.max(0, this.tripStreak - this.restDays) + 1;
  }

  /** 탐사를 보낼 수 없으면 그 이유 */
  expeditionReason(memberId = null) {
    if (this.phase !== 'home') return '지금은 탐사를 보낼 수 없다';
    if (this.event && !this.event.resolved) return '먼저 오늘의 사건에 대응하자';
    if (this.expedition) return `${this.person(this.expedition.memberId).name}의 탐사가 아직 끝나지 않았다`;
    if (this.presentPeople().length <= 1) return '집을 비워 둘 수는 없다 — 누군가는 남아서 집을 지켜야 한다';
    if (memberId == null) return null;
    const p = this.person(memberId);
    if (!isHome(p)) return '집에 없다';
    const why = incapableReason(p);
    return why ? `${josa(p.name, '은/는')} ${why}` : null;
  }

  sendExpedition({ memberId, withWeapon = false }) {
    if (this.expeditionReason(memberId)) return false;
    const p = this.person(memberId);
    const weapon = withWeapon && this.stock.weapon > 0;
    if (weapon) this.stock.weapon -= 1;
    const [min, max] = EXPEDITION_DAYS;
    this.expedition = {
      memberId,
      withWeapon: weapon,
      departDay: this.day,
      returnDay: this.day + this.rng.outcome.int(min, max),
      risk: this.expeditionRisk(memberId, weapon),
    };
    this.expeditions += 1;
    this.tripStreak = this.nextTripStreak();
    this.restDays = 0;
    p.status = 'away';
    this.addLog(`${josa(p.name, '이/가')} ${weapon ? '야구 방망이를 챙겨 들고 ' : ''}물자를 찾아 밖으로 나갔다.`, 'event', 'action');
    this.syncRations();
    this.emit();
    return true;
  }

  /** 열린 탈출 경로가 요구하는데 아직 모자란 물품(탐사·보급 상자에서 조금 더 잘 나온다) */
  neededItems() {
    const s = this.stock;
    const sis = this.person('sis');
    const open = (id) => {
      const c = this.director.chains[id];
      return c.opened && !['done', 'failed'].includes(c.status);
    };
    const out = [];
    if (open('rescue')) {
      if (!s.radio && !isCapable(sis)) out.push('radio');
      if (s.battery < 1 && this.director.chains.rescue.stage <= 1) out.push('battery');
      if (s.flare < 1) out.push('flare');
    }
    if (open('car')) {
      if (!s.toolkit && !isCapable(sis) && this.director.chains.car.stage <= 1) out.push('toolkit');
      if (s.fuel < 2) out.push('fuel');
      if (s.map < 1) out.push('roadmap');
    }
    if (open('group') && s.med < 1 && this.director.chains.group.stage <= 1) out.push('bandage');
    if (open('safezone') && this.director.chains.safezone.stage <= 1 && s.map < 1 && !isCapable(this.person('dad'))) out.push('roadmap');
    if (open('train') && s.med < 1 && this.presentPeople().some((p) => p.health > 0)) out.push('bandage');
    if (open('caravan')) {
      const stage = this.director.chains.caravan.stage;
      if (stage <= 1 && !isCapable(sis) && !s.toolkit && !s.fuel) out.push('toolkit');
      if (s.battery < 2) out.push('battery');
    }
    return out;
  }

  /** 물품 id 목록을 집 재고에 넣는다. */
  addItems(ids) {
    for (const id of ids) {
      for (const [key, n] of Object.entries(ITEMS[id].gives)) this.stock[key] += n;
    }
  }

  /** 아침에 탐사자가 돌아오는지 확인한다. */
  resolveExpedition() {
    const exp = this.expedition;
    if (!exp || exp.returnDay > this.day) return;
    this.expedition = null;
    const p = this.person(exp.memberId);
    const rng = this.rng.outcome;
    const days = this.day - exp.departDay;
    const report = { day: this.day, memberId: p.id, name: p.name, items: [], extra: { food: 0, water: 0 } };

    if (rng.chance(exp.risk.lost)) {
      p.status = 'lost';
      p.fate = '물자를 찾아 나갔다가 돌아오지 않았다.';
      report.outcome = 'lost';
      report.text = `${josa(p.name, '이/가')} 탐사에서 돌아오지 않았다.`;
      this.expeditionReport = report;
      this.addLog(report.text, 'bad', 'morning');
      if (p.isPlayer) this.setEnding('lost');
      return;
    }

    p.status = 'home';
    p.hunger = Math.min(p.hunger + days, HUNGER_WEAK - 1);
    p.thirst = Math.min(p.thirst + days, THIRST_WEAK - 1);
    const { capacity, found } = this.difficulty.expedition;
    const loot = rollLoot({ rng, capacity, found, needs: this.neededItems() });
    this.addItems(loot.items);
    this.stock.food += loot.extra.food;
    this.stock.water += loot.extra.water;
    if (exp.withWeapon) this.stock.weapon += 1;
    report.items = loot.items;
    report.extra = loot.extra;

    const injured = rng.chance(exp.risk.injury);
    if (injured) p.health = Math.min(HEALTH_DEATH - 1, p.health + 1);
    report.outcome = injured ? 'injured' : 'returned';
    const carried = itemSummary(loot.items);
    const extraText = formatResources(loot.extra);
    const back = p.isPlayer ? `${days}일 만에 집으로 돌아왔다.` : `${josa(p.name, '이/가')} ${days}일 만에 돌아왔다!`;
    const bag = carried ? `배낭에서 ${carried}가 나왔다.` : '배낭은 거의 비어 있었다. 쓸 만한 것을 찾지 못했다고 한다.';
    report.text = [
      back,
      bag,
      extraText ? `길에서 ${extraText}도 주워 왔다.` : '',
      injured ? `${p.isPlayer ? '나는' : josa(p.name, '은/는')} 어딘가를 다쳐 절뚝이며 들어왔다.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    this.expeditionReport = report;
    this.addLog(report.text, injured ? 'warn' : 'good', 'morning');
  }

  // ── 하루 ─────────────────────────────────────

  startDay() {
    this.momCaredToday = false;
    this.talkedToday = false;
    for (const p of this.people) {
      p.treatedToday = false;
      p.talkedToday = false;
    }
    this.resolveExpedition();
    if (this.ending) return;
    this.revivePath();
    const inst = this.director.pick(this.day, this);
    this.event = inst ? { ...inst, resolved: false, outcome: null, choice: null } : null;
    this.eventQueue = [];
    this.resolvedToday = [];
    if (inst) this.addLog(`사건 발생: ${EVENT_DEFS[inst.defId].title}`, 'event', 'event-start');
    if (inst?.chainId) {
      const bonus = this.director.pickBonus(this.day, this);
      if (bonus) this.eventQueue.push({ ...bonus, resolved: false, outcome: null, choice: null });
    }
    this.rationsTouched = false;
    this.resetRations();
    this.writePage();
  }

  /** 탈출 경로가 모두 닫혀 이길 길이 없어지면, 며칠 뒤 하나가 다시 열린다. */
  revivePath() {
    const paths = PATHS.map((def) => this.director.chains[def.id]);
    if (!paths.every((c) => c.status === 'failed')) {
      this.reviveAt = null;
      return;
    }
    if (this.reviveAt == null) {
      this.reviveAt = this.day + this.rng.schedule.int(8, 15);
      return;
    }
    if (this.day < this.reviveAt) return;
    const chain = paths[this.revived % paths.length];
    this.revived += 1;
    this.reviveAt = null;
    this.director.reopen(chain.id, this.day);
  }

  quietStreak() {
    return this.director.quietStreak;
  }

  /** 하루 필요량: 집에 있는 사람 1명당 식량 1, 물 1 */
  dailyNeed() {
    const n = this.presentPeople().length;
    return { people: n, food: n, water: n };
  }

  /** 기본 배급표: 배고프거나 목마른 사람에게만 준다(매일 줄 필요는 없다). all=true면 가능한 만큼 전원에게. */
  resetRations(all = false) {
    const present = this.presentPeople();
    const rations = {};
    for (const p of present) rations[p.id] = { food: false, water: false };
    let water = this.stock.water;
    for (const p of [...present].sort((a, b) => b.thirst - a.thirst)) {
      if (water > 0 && (all || needsWater(p))) {
        rations[p.id].water = true;
        water -= 1;
      }
    }
    let food = this.stock.food;
    for (const p of [...present].sort((a, b) => b.hunger - a.hunger)) {
      if (food > 0 && (all || needsFood(p))) {
        rations[p.id].food = true;
        food -= 1;
      }
    }
    this.rations = rations;
  }

  /** 재고나 식구가 바뀌면 배급표를 맞춘다. 직접 고친 적이 없으면 기본 배급을 다시 계산한다. */
  syncRations() {
    if (!this.rationsTouched) {
      this.resetRations();
      return;
    }
    const present = this.presentPeople();
    const next = {};
    for (const p of present) next[p.id] = this.rations[p.id] ?? { food: false, water: false };
    this.rations = next;
    for (const kind of ['food', 'water']) {
      let over = this.rationCount(kind) - this.stock[kind];
      for (const p of [...present].reverse()) {
        if (over <= 0) break;
        if (next[p.id][kind]) {
          next[p.id][kind] = false;
          over -= 1;
        }
      }
    }
  }

  rationCount(kind) {
    return Object.values(this.rations).filter((r) => r[kind]).length;
  }

  setRation(personId, kind, on) {
    if (this.phase !== 'home') return false;
    const p = this.person(personId);
    if (!isHome(p) || !['food', 'water'].includes(kind)) return false;
    const entry = (this.rations[personId] ??= { food: false, water: false });
    if (on && !entry[kind] && this.rationCount(kind) >= this.stock[kind]) return false;
    entry[kind] = !!on;
    this.rationsTouched = true;
    this.emit();
    return true;
  }

  setAllRations(on) {
    if (this.phase !== 'home') return;
    this.rationsTouched = true;
    if (on) {
      this.resetRations(true);
    } else {
      for (const r of Object.values(this.rations)) r.food = r.water = false;
    }
    this.emit();
  }

  medReason(personId) {
    const p = this.person(personId);
    if (!isHome(p)) return '집에 없다';
    if (p.health <= 0) return '다친 곳이 없다';
    if (this.stock.med < 1) return '구급약이 없다';
    return null;
  }

  useMed(personId) {
    if (this.phase !== 'home' || this.medReason(personId)) return false;
    const p = this.person(personId);
    this.stock.med -= 1;
    p.health -= 1;
    p.untreated = 0;
    p.treatedToday = true;
    this.addLog(`${p.isPlayer ? '내' : `${p.name}의`} 상처를 구급약으로 치료했다.`, 'good', 'action');
    this.emit();
    return true;
  }

  momCareReason(personId) {
    const mom = this.person('mom');
    if (!isHome(mom)) return '엄마가 집에 없다';
    if (!isCapable(mom)) return `엄마는 ${incapableReason(mom)}`;
    if (this.momCaredToday) return '엄마는 오늘 이미 간호했다';
    const p = this.person(personId);
    if (!isHome(p) || p.health <= 0) return '돌볼 부상이 없다';
    if (p.id === 'mom') return '스스로를 간호할 수는 없다';
    if (p.treatedToday) return '오늘은 이미 치료받았다';
    return null;
  }

  momCare(personId) {
    if (this.phase !== 'home' || this.momCareReason(personId)) return false;
    const p = this.person(personId);
    p.treatedToday = true;
    p.untreated = 0;
    this.momCaredToday = true;
    this.addLog(`엄마가 ${josa(p.name, '을/를')} 정성껏 간호했다.`, 'good', 'action');
    this.emit();
    return true;
  }
  /** 마음 돌보기: 하루에 한 명과 이야기를 나눠 마음 상태를 한 단계 덜어 준다. */
  talkReason(personId) {
    if (this.talkedToday) return '오늘은 이미 이야기를 나눴다';
    const p = this.person(personId);
    if (!isHome(p) || p.isPlayer) return '이야기를 나눌 사람이 없다';
    if (p.mood <= 0) return '마음이 안정되어 있다';
    const listener = this.presentPeople().find((q) => q !== p && (q.isPlayer || isCapable(q)));
    if (!listener) return '곁에서 들어 줄 사람이 없다';
    return null;
  }

  talk(personId) {
    if (this.phase !== 'home' || this.talkReason(personId)) return false;
    const p = this.person(personId);
    p.mood -= 1;
    p.talkedToday = true;
    this.talkedToday = true;
    this.addLog(`${josa(p.name, '과/와')} 오래 이야기를 나눴다. 조금은 마음이 풀린 얼굴이다.`, 'good', 'action');
    this.emit();
    return true;
  }


  // ── 사건 ─────────────────────────────────────

  eventDef() {
    return this.event ? EVENT_DEFS[this.event.defId] : null;
  }

  eventChain() {
    return this.event?.chainId ? this.director.chains[this.event.chainId] : null;
  }

  eventView() {
    const def = this.eventDef();
    if (!def) return null;
    const chain = this.eventChain();
    const { params } = this.event;
    return {
      id: def.id,
      title: def.title,
      kind: def.kind,
      chainId: def.chainId ?? null,
      stage: this.event.stage ?? null,
      text: evaluate(def.text, this, params, chain),
      hint: def.hint ?? null,
      apocalypse: !!def.apocalypse,
      resolved: this.event.resolved,
      outcome: this.event.outcome,
      choice: this.event.choice,
      options: def.options.map((opt) => {
        const reason = opt.check ? opt.check(this, params, chain) : null;
        return {
          id: opt.id,
          label: evaluate(opt.label, this, params, chain),
          who: opt.who ?? null,
          tag: opt.tag ?? null,
          cost: evaluate(opt.cost, this, params, chain) ?? null,
          note: evaluate(opt.note, this, params, chain) ?? null,
          disabled: !!reason,
          reason,
        };
      }),
    };
  }

  chooseOption(optionId) {
    if (this.phase !== 'home' || !this.event || this.event.resolved) return { ok: false, reason: '대응할 사건이 없다' };
    const def = this.eventDef();
    const opt = def.options.find((o) => o.id === optionId);
    if (!opt) return { ok: false, reason: '없는 선택지' };
    const chain = this.eventChain();
    const reason = opt.check ? opt.check(this, this.event.params, chain) : null;
    if (reason) return { ok: false, reason };

    const text = opt.resolve(this.makeContext());
    this.event.resolved = true;
    this.event.choice = optionId;
    this.event.outcome = text;
    if (chain && chain.status === 'active') {
      // 선택지가 일정을 정하지 않았다면 다음 날 다시 묻는다(경로가 멈추지 않게).
      this.director.schedule(chain, this.day + 1);
    }
    this.addLog(text, 'event', 'event', { title: def.title });
    this.checkDeaths();
    if (!this.ending && this.pendingWin) {
      const { endingId, extra } = this.pendingWin;
      this.pendingWin = null;
      this.setEnding(endingId, extra);
    }
    if (!this.ending && this.pendingMovePlace) {
      const place = this.pendingMovePlace;
      this.pendingMovePlace = null;
      this.prepareMove(place);
      this.emit();
      return { ok: true, text };
    }
    if (!this.ending) {
      this.syncRations();
      if (this.eventQueue.length) {
        // 오늘 이어서 일어나는 사건으로 넘어간다
        this.resolvedToday.push(this.eventView());
        this.event = this.eventQueue.shift();
        this.addLog(`사건 발생: ${EVENT_DEFS[this.event.defId].title}`, 'event', 'event-start');
      }
    }
    this.emit();
    return { ok: true, text };
  }

  makeContext() {
    const game = this;
    const chain = this.eventChain();
    return {
      game,
      day: this.day,
      rng: this.rng.outcome,
      params: this.event.params,
      has: (key, n = 1) => game.stock[key] >= n,
      take(key, n = 1) {
        const taken = Math.min(n, game.stock[key]);
        game.stock[key] -= taken;
        return taken;
      },
      give(key, n = 1) {
        game.stock[key] += n;
      },
      person: (id) => game.person(id),
      present: () => game.presentPeople(),
      injure(p, n = 1) {
        p.health = Math.min(HEALTH_DEATH, p.health + n);
      },
      heal(p, n = 1) {
        p.health = Math.max(0, p.health - n);
        p.untreated = 0;
        p.treatedToday = true;
      },
      chain: chain ? this.director.controller(chain.id, this.day) : null,
      /** 미션(연쇄 사건)을 시작하거나 조작할 때 */
      mission: (id) => this.director.controller(id, this.day),
      /** 나쁜 결과가 나올 확률 p를 난이도에 맞춰 굴린다 */
      danger: (p) => this.rng.outcome.chance(Math.min(0.95, p * game.difficulty.harm)),
      /** 마음 상태를 바꾼다(+ 나빠짐, - 나아짐). 주인공은 마음 상태가 없다. */
      mood(p, delta) {
        if (!p || (p.isPlayer && delta > 0)) return; // 주인공은 위로만 받는다(나빠지는 건 혼자 남았을 때뿐)
        p.mood = Math.max(0, Math.min(MOOD_MAX, p.mood + delta));
        if (delta < 0) p.talkedToday = true;
      },
      family: () => game.presentPeople().filter((p) => !p.isPlayer),
      /** 무작위 물품 n개를 얻어 재고에 넣고, 그 목록을 돌려준다 */
      loot(n) {
        const ids = rollItems({ rng: game.rng.outcome, count: n, needs: game.neededItems() });
        game.addItems(ids);
        return ids;
      },
      win(endingId, extra = {}) {
        game.pendingWin = { endingId, extra };
      },
      /** 다른 곳으로 이사한다(사건 처리가 끝난 뒤 실시간 구간이 시작된다) */
      move(place) {
        game.pendingMovePlace = place;
      },
      /** 탈출이 아닌 결말(기묘한 결말·패배)도 같은 방식으로: 사건 처리가 끝난 뒤에 정해진다 */
      end(endingId, extra = {}) {
        game.pendingWin = { endingId, extra };
      },
    };
  }

  // ── 하루 마감 ────────────────────────────────

  canEndDay() {
    if (this.phase !== 'home') return '지금은 하루를 마칠 수 없다';
    if (this.event && !this.event.resolved) return '먼저 오늘의 사건에 대응하자';
    return null;
  }

  endDay() {
    if (this.canEndDay()) return false;
    const report = [];
    const present = this.presentPeople();
    // 배고프거나 목마른데도 배급을 받지 못한 사람(밤사이 요약에 적는다)
    const unfed = present.filter((p) => needsFood(p) && !this.rations[p.id]?.food);
    const unwatered = present.filter((p) => needsWater(p) && !this.rations[p.id]?.water);
    let usedFood = 0;
    let usedWater = 0;
    for (const p of present) {
      const r = this.rations[p.id] ?? {};
      if (r.food && this.stock.food > 0) {
        this.stock.food -= 1;
        usedFood += 1;
        p.hunger = 0;
      } else {
        p.hunger += 1;
      }
      if (r.water && this.stock.water > 0) {
        this.stock.water -= 1;
        usedWater += 1;
        p.thirst = 0;
      } else {
        p.thirst += 1;
      }
    }
    report.push(
      ...mealLines({
        present,
        ate: present.filter((p) => p.hunger === 0).map((p) => p.name),
        drank: present.filter((p) => p.thirst === 0).map((p) => p.name),
        usedFood,
        usedWater,
        unfed: unfed.map((p) => p.name),
        unwatered: unwatered.map((p) => p.name),
      }),
    );

    for (const p of present) {
      if (p.health <= 0) continue;
      if (p.treatedToday) {
        p.untreated = 0;
        continue;
      }
      p.untreated += 1;
      if (p.untreated >= this.difficulty.worsenDays) {
        p.health = Math.min(HEALTH_DEATH, p.health + 1);
        p.untreated = 0;
        report.push({ text: `치료받지 못한 ${p.isPlayer ? '내' : `${p.name}의`} 상처가 덧났다.`, tone: 'bad' });
      }
    }

    if (!this.expedition) this.restDays += 1;
    // 밤사이 저절로 일어나는 일(쥐, 빗물, 잠 못 든 밤…)
    const night = this.nightEvents ? rollNightEvent(this, this.rng.outcome) : null;
    if (night) report.push({ text: night.text, tone: night.tone });
    const lostMind = this.updateMoods(present, report);
    this.checkDeaths(report);
    if (lostMind && !this.ending) this.setEnding('madness');
    for (const line of report) this.addLog(line.text, line.tone || 'night', 'night');
    this.nightReport = report.map((line) => line.text);
    if (this.ending) {
      this.emit();
      return true;
    }
    this.day += 1;
    this.startDay();
    this.emit();
    return true;
  }

  /**
   * 밤사이 마음 상태가 바뀐다. 오래 갇혀 지낼수록, 배고프거나 다쳤을수록 나빠지기 쉽다.
   * 그날 이야기를 나눴거나 돌봄을 받은 사람은 나빠지지 않는다. 무너진 사람은 집을 나가 버릴 수 있다.
   */
  updateMoods(present, report) {
    const rng = this.rng.outcome;
    const garden = this.director.chains.garden;
    const gardenActive = garden.opened && !['done', 'failed'].includes(garden.status);
    for (const p of present) {
      if (p.isPlayer || p.status !== 'home') continue;
      const before = p.mood;
      if (!p.talkedToday) {
        let worse = 0.05 + Math.min(0.1, this.day * 0.0015);
        if (needsFood(p) || needsWater(p)) worse += 0.08;
        if (p.health >= 1) worse += 0.06;
        if (this.flags.dog) worse -= 0.025;
        if (gardenActive) worse -= 0.015;
        if (rng.chance(Math.max(0.01, worse * this.difficulty.harm))) p.mood = Math.min(MOOD_MAX, p.mood + 1);
        else if (p.mood > 0 && rng.chance(0.06)) p.mood -= 1;
      }
      if (p.mood > before && p.mood >= MOOD_LOW) {
        const lines = {
          2: `${josa(p.name, '은/는')} 요즘 말수가 부쩍 줄었다.`,
          3: `${josa(p.name, '은/는')} 하루 종일 구석에 웅크린 채 아무것도 하려 하지 않는다.`,
          4: `${josa(p.name, '이/가')} 밤새 누군가와 속삭이듯 혼잣말을 했다. 무서운 목소리가 들린다고 한다.`,
        };
        report.push({ text: lines[p.mood], tone: p.mood >= MOOD_DEPRESSED ? 'bad' : 'warn' });
      }
      if (p.mood >= MOOD_BROKEN && !p.talkedToday && rng.chance(0.25 * this.difficulty.harm)) {
        p.status = 'lost';
        p.fate = '새벽에 목소리를 따라 집을 나가 돌아오지 않았다.';
        report.push({
          text: `새벽에 문이 열리는 소리가 났다. ${josa(p.name, '이/가')} 목소리를 따라 밖으로 나가 버렸다. 다시 돌아오지 않았다.`,
          tone: 'bad',
        });
      }
    }
    return this.updateLoneliness(present, report);
  }

  /**
   * 주인공 혼자 남으면(탐사 나간 식구도 없으면) 밤마다 마음이 무너져 간다. 혼자인 날이 길수록 빨라지고,
   * 보리가 곁에 있으면 훨씬 느려진다. 끝까지 무너지면 '홀로 남은 집'. 식구와 함께 지내면 다시 나아진다.
   * 결말이 정해졌으면 true.
   */
  updateLoneliness(present, report) {
    const me = this.me;
    if (me.status !== 'home') return false;
    const alone = present.every((p) => p.isPlayer) && !this.expedition;
    if (!alone) {
      this.aloneDays = 0;
      if (me.mood > 0) me.mood -= 1;
      return false;
    }
    this.aloneDays = (this.aloneDays ?? 0) + 1;
    if (this.aloneDays < 3) return false; // 처음 며칠은 버틴다
    const rng = this.rng.outcome;
    const worse = (0.08 + 0.02 * this.aloneDays) * this.difficulty.harm * (this.flags.dog ? 0.4 : 1);
    if (rng.chance(Math.min(0.9, worse)) && me.mood < MOOD_MAX) {
      me.mood += 1;
      const lines = {
        1: '혼잣말이 늘었다. 대답해 줄 사람이 없다.',
        2: '밤마다 가족의 목소리가 들리는 것 같아 잠을 설쳤다.',
        3: '벽에 가족의 얼굴을 그렸다. 매일 그 앞에서 하루 일을 이야기한다.',
        4: '그림 속 가족이 대답을 했다. 이상하게도 무섭지 않았다.',
      };
      report.push({ text: lines[me.mood], tone: me.mood >= MOOD_LOW ? 'bad' : 'warn' });
    }
    return me.mood >= MOOD_BROKEN && rng.chance(0.35);
  }

  checkDeaths(report = null) {
    let playerCause = null;
    for (const p of this.presentPeople()) {
      let cause = null;
      if (p.health >= HEALTH_DEATH) cause = '부상';
      else if (p.thirst >= THIRST_DEATH) cause = '탈수';
      else if (p.hunger >= HUNGER_DEATH) cause = '굶주림';
      if (!cause) continue;
      p.status = 'dead';
      p.cause = cause;
      p.fate = `${josa(cause, '으로/로')} 세상을 떠났다.`;
      const line = `${josa(p.name, '이/가')} ${josa(cause, '으로/로')} 숨을 거뒀다.`;
      if (report) report.push({ text: line, tone: 'bad' });
      else this.addLog(line, 'bad', 'death');
      if (p.isPlayer) playerCause = cause;
    }
    // 같은 밤에 여럿이 숨지면 모두 기록한 뒤에 결말을 정한다(생존자 명단이 정확하도록).
    if (playerCause) this.setEnding('died', { cause: playerCause });
  }

  // ── 승리 경로 ────────────────────────────────

  pathsView() {
    return PATHS.map((def) => {
      const chain = this.director.chains[def.id];
      let status;
      if (chain.status === 'done') status = 'done';
      else if (chain.status === 'failed') status = chain.opened ? 'failed' : 'closed';
      else if (chain.opened) status = 'open';
      else if (chain.seen && chain.status !== 'active') status = 'missed'; // 첫 사건을 거절한 뒤

      else status = 'hidden';
      const base = { id: def.id, icon: def.icon, title: def.title, status, stage: chain.stage };
      if (status === 'hidden') return base;
      if (status === 'missed') return { ...base, next: chainMissedNote(chain) };
      if (status === 'failed' || status === 'closed') return { ...base, next: chain.failReason };
      const view = { ...base, ...def.describe(chain, this) };
      // 마지막 단계(탈출하는 날)까지 탐사자가 못 돌아올 수도 있으면 미리 알린다.
      const exp = this.expedition;
      const lastStage = chain.stage === def.stages.length - 1;
      if (exp && lastStage && chain.due != null && exp.departDay + EXPEDITION_DAYS[1] >= chain.due) {
        view.next += ` 탐사 중인 ${josa(this.person(exp.memberId).name, '이/가')} 그날까지 돌아오지 못하면 두고 가야 한다.`;
      }
      return view;
    });
  }

  // ── 미션 ─────────────────────────────────────

  /** 시작한 미션 목록: [{ id, icon, title, status: 'active'|'done'|'failed', text, schedule }] */
  missionsView() {
    return MISSIONS.map((def) => {
      const chain = this.director.chains[def.id];
      if (!chain.opened) return null;
      const status = chain.status === 'done' ? 'done' : chain.status === 'failed' ? 'failed' : 'active';
      const base = { id: def.id, icon: def.icon, title: def.title, status };
      if (status !== 'active') return { ...base, text: chain.result ?? chain.failReason ?? '' };
      return { ...base, ...def.describe(chain, this) };
    }).filter(Boolean);
  }

  // ── 결말 ─────────────────────────────────────

  setEnding(id, extra = {}) {
    if (this.ending) return;
    const def = ENDINGS[id];
    let text = def.text;
    if (id === 'died') text = `${josa(extra.cause, '으로/로')} 쓰러졌다. ${def.text}`;
    if (extra.leftBehind?.length) text += ` ${extra.leftPlace ?? '옥상에'} 남겨진 ${extra.leftBehind.join(', ')}의 모습이 눈에 밟힌다.`;
    // 집을 떠나는 결말이면, 그날 탐사를 나가 있던 사람은 함께 가지 못한다.
    const awayAtEscape = def.type !== 'defeat' ? this.people.filter((p) => p.status === 'away') : [];
    for (const p of awayAtEscape) {
      p.status = 'lost';
      p.fate = '탐사에서 돌아오기 전에 떠나야 했다.';
    }
    if (awayAtEscape.length) text += ` 탐사를 나간 ${josa(nameList(awayAtEscape.map((p) => p.name)), '을/를')} 기다릴 수 없었다.`;
    if (def.type === 'victory' && this.flags.dog) text += ' 보리도 꼬리를 흔들며 끝까지 함께했다.';
    this.ending = {
      id,
      type: def.type,
      icon: def.icon,
      title: def.title,
      text,
      day: this.day,
      difficulty: this.difficulty.name,
      expeditions: this.expeditions,
      survivors: this.presentPeople().map((p) => p.name),
      lost: this.people.filter((p) => ['dead', 'lost', 'left'].includes(p.status)).map((p) => p.name),
      ...extra,
    };
    this.phase = 'ending';
  }
}
