// 게임 전체 흐름: 첫 보급(마트 출발) → 가족 선택 → 하루 단위 생존(사건·배급·추가 보급) → 결말.
// 화면(DOM)과 분리되어 있어 테스트에서 그대로 조작할 수 있다.
import {
  HEALTH_DEATH,
  HUNGER_DEATH,
  INJURY_WORSEN_DAYS,
  MAX_RUNS_PER_DAY,
  THIRST_DEATH,
} from './constants.js';
import { ENDINGS } from './endings.js';
import { CHAINS, EVENT_DEFS, RANDOM_EVENTS } from './events/index.js';
import { chainMissedNote } from './events/chains.js';
import { EventDirector } from './events/director.js';
import { Inventory } from './inventory.js';
import { emptyStock, formatResources, ITEMS } from './items.js';
import {
  FAMILY_DEFS,
  PLAYER_DEF,
  createPerson,
  healthLabel,
  incapableReason,
  isCapable,
  isHome,
} from './people.js';
import { Rng, randomSeed } from './rng.js';
import { createRun, runDanger, stepRun } from './run.js';
import { josa } from './text.js';
import { FAMILY_SPOTS, initialMartStock, martSummary } from './world.js';

const evaluate = (value, ...args) => (typeof value === 'function' ? value(...args) : value);

export class Game {
  constructor({ seed = randomSeed(), zombies = true } = {}) {
    this.seed = seed;
    const root = new Rng(seed);
    this.rng = { schedule: root.fork('schedule'), outcome: root.fork('outcome'), run: root.fork('run') };
    this.zombies = zombies;

    this.phase = 'ready'; // ready → run → family → home ⇄ run → ending
    this.day = 0;
    this.people = [createPerson(PLAYER_DEF, 'home'), ...FAMILY_DEFS.map((def) => createPerson(def, 'outside'))];
    this.stock = emptyStock();
    this.inventory = new Inventory();
    this.martStock = initialMartStock();

    this.runs = 0; // 첫 보급 포함
    this.supplyRuns = 0; // 추가 보급 횟수
    this.run = null;
    this.lastRun = null;
    this.ranToday = 0;

    this.familyQueue = [];
    this.director = new EventDirector({ rng: this.rng.schedule, chains: CHAINS, randomEvents: RANDOM_EVENTS });
    this.event = null;
    this.rations = {};
    this.rationsTouched = false;
    this.momCaredToday = false;
    this.nightReport = [];
    this.log = [];
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

  addLog(text, tone = 'info') {
    this.log.push({ day: this.day, text, tone });
  }

  martSummary() {
    return martSummary(this.martStock);
  }

  nextRunDanger() {
    return runDanger('supply', this.supplyRuns + 1);
  }

  // ── 보급(실시간 구간) ─────────────────────────

  startFirstRun() {
    if (this.phase !== 'ready') return false;
    this.beginRun('first');
    return true;
  }

  canStartSupplyRun() {
    if (this.phase !== 'home') return '지금은 나갈 수 없다';
    if (this.event && !this.event.resolved) return '먼저 오늘의 사건에 대응하자';
    if (this.ranToday >= MAX_RUNS_PER_DAY) return '오늘은 이미 보급을 다녀왔다. 해가 지기 전에 다시 나가는 건 무리다';
    return null;
  }

  startSupplyRun() {
    if (this.canStartSupplyRun()) return false;
    this.supplyRuns += 1;
    this.ranToday += 1;
    this.beginRun('supply');
    return true;
  }

  beginRun(mode) {
    this.runs += 1;
    this.run = createRun({
      mode,
      supplyIndex: this.supplyRuns,
      inventory: this.inventory,
      martStock: this.martStock,
      rng: this.rng.run,
      playerHealth: this.me.health,
      familyMarkers:
        mode === 'first'
          ? FAMILY_DEFS.map((def) => ({ id: def.id, name: def.name, color: def.color, ...FAMILY_SPOTS[def.id] }))
          : [],
      zombies: this.zombies,
    });
    this.phase = 'run';
    this.emit();
  }

  /** 실시간 구간을 dt초 진행한다. 결과가 나면 다음 단계로 넘어간다. */
  stepRun(dt, input) {
    if (this.phase !== 'run' || !this.run) return;
    stepRun(this.run, dt, input);
    if (this.run.outcome) this.finishRun();
  }

  finishRun() {
    const run = this.run;
    this.lastRun = {
      mode: run.mode,
      outcome: run.outcome,
      carried: [...this.inventory.items],
      timeLeft: run.timeLeft,
      elapsed: run.elapsed,
      day: this.day,
    };
    if (run.outcome === 'home') {
      const names = this.inventory.items.map((id) => ITEMS[id].name);
      this.addLog(
        `${run.mode === 'first' ? '마트 탈출' : '보급'} 성공: ${names.length ? names.join(', ') : '빈손'} (남은 시간 ${run.timeLeft.toFixed(1)}초)`,
        'good',
      );
      this.run = null;
      if (run.mode === 'first') {
        this.phase = 'family';
        this.familyQueue = FAMILY_DEFS.map((def) => def.id);
      } else {
        this.phase = 'home';
      }
    } else {
      this.setEnding(run.outcome);
    }
    this.emit();
  }

  // ── 가족 선택(첫 귀가) ────────────────────────

  familyCandidate() {
    return this.familyQueue.length ? this.person(this.familyQueue[0]) : null;
  }

  decideFamily(id, bring) {
    if (this.phase !== 'family' || this.familyQueue[0] !== id) return false;
    this.familyQueue.shift();
    const p = this.person(id);
    p.status = bring ? 'home' : 'left';
    this.addLog(bring ? `${josa(p.name, '을/를')} 데려왔다.` : `${josa(p.name, '을/를')} 두고 왔다.`, bring ? 'good' : 'warn');
    if (!this.familyQueue.length) {
      this.phase = 'home';
      this.day = 1;
      this.startDay();
    }
    this.emit();
    return true;
  }

  // ── 재고 ─────────────────────────────────────

  deposit(index) {
    if (this.phase !== 'home') return false;
    const itemId = this.inventory.removeAt(index);
    if (!itemId) return false;
    const item = ITEMS[itemId];
    for (const [key, n] of Object.entries(item.gives)) this.stock[key] += n;
    this.addLog(`${josa(item.name, '을/를')} 재고로 옮겼다. (${formatResources(item.gives)} 추가)`);
    this.syncRations();
    this.emit();
    return true;
  }

  depositAll() {
    if (this.phase !== 'home' || this.inventory.isEmpty) return false;
    while (!this.inventory.isEmpty) this.deposit(0);
    return true;
  }

  // ── 하루 ─────────────────────────────────────

  startDay() {
    this.ranToday = 0;
    this.momCaredToday = false;
    for (const p of this.people) p.treatedToday = false;
    const inst = this.director.pick(this.day, this);
    this.event = inst ? { ...inst, resolved: false, outcome: null, choice: null } : null;
    if (inst) this.addLog(`사건 발생: ${EVENT_DEFS[inst.defId].title}`, 'event');
    this.rationsTouched = false;
    this.resetRations();
  }

  quietStreak() {
    return this.director.quietStreak;
  }

  /** 하루 필요량: 집에 있는 사람 1명당 식량 1, 물 1 */
  dailyNeed() {
    const n = this.presentPeople().length;
    return { people: n, food: n, water: n };
  }

  resetRations() {
    const present = this.presentPeople();
    const rations = {};
    for (const p of present) rations[p.id] = { food: false, water: false };
    let water = this.stock.water;
    for (const p of [...present].sort((a, b) => b.thirst - a.thirst)) {
      if (water > 0) {
        rations[p.id].water = true;
        water -= 1;
      }
    }
    let food = this.stock.food;
    for (const p of [...present].sort((a, b) => b.hunger - a.hunger)) {
      if (food > 0) {
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
      this.resetRations();
      this.rationsTouched = true;
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
    this.addLog(`${p.name}에게 구급약을 썼다. (${healthLabel(p.health).text})`, 'good');
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
    this.addLog(`엄마가 ${josa(p.name, '을/를')} 간호했다. 오늘 밤 부상이 악화되지 않는다.`, 'good');
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
      resolved: this.event.resolved,
      outcome: this.event.outcome,
      choice: this.event.choice,
      options: def.options.map((opt) => {
        const reason = opt.check ? opt.check(this, params, chain) : null;
        return {
          id: opt.id,
          label: opt.label,
          who: opt.who ?? null,
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
    this.addLog(text, 'event');
    this.checkDeaths();
    if (!this.ending && this.pendingWin) {
      const { endingId, extra } = this.pendingWin;
      this.pendingWin = null;
      this.setEnding(endingId, extra);
    }
    if (!this.ending) this.syncRations();
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
      win(endingId, extra = {}) {
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
    report.push(`${present.length}명이 하루를 보냈다. 소비: 식량 ${usedFood}, 물 ${usedWater}`);
    const unfed = present.filter((p) => !(this.rations[p.id]?.food));
    const unwatered = present.filter((p) => !(this.rations[p.id]?.water));
    if (unwatered.length) report.push(`물을 마시지 못함: ${unwatered.map((p) => p.name).join(', ')}`);
    if (unfed.length) report.push(`굶음: ${unfed.map((p) => p.name).join(', ')}`);

    for (const p of present) {
      if (p.health <= 0) continue;
      if (p.treatedToday) {
        p.untreated = 0;
        continue;
      }
      p.untreated += 1;
      if (p.untreated >= INJURY_WORSEN_DAYS) {
        p.health = Math.min(HEALTH_DEATH, p.health + 1);
        p.untreated = 0;
        report.push(`치료받지 못한 ${p.name}의 부상이 악화됐다. (${healthLabel(p.health).text})`);
      }
    }

    this.checkDeaths(report);
    for (const line of report) this.addLog(line, 'night');
    this.nightReport = report;
    if (this.ending) {
      this.emit();
      return true;
    }
    this.day += 1;
    this.startDay();
    this.emit();
    return true;
  }

  checkDeaths(report = null) {
    for (const p of this.presentPeople()) {
      let cause = null;
      if (p.health >= HEALTH_DEATH) cause = '부상';
      else if (p.thirst >= THIRST_DEATH) cause = '탈수';
      else if (p.hunger >= HUNGER_DEATH) cause = '굶주림';
      if (!cause) continue;
      p.status = 'dead';
      p.cause = cause;
      const line = `${josa(p.name, '이/가')} ${josa(cause, '으로/로')} 숨을 거뒀다.`;
      if (report) report.push(line);
      else this.addLog(line, 'bad');
      if (p.isPlayer) this.setEnding('died', { cause });
    }
  }

  // ── 승리 경로 ────────────────────────────────

  pathsView() {
    return CHAINS.map((def) => {
      const chain = this.director.chains[def.id];
      let status;
      if (chain.status === 'done') status = 'done';
      else if (chain.status === 'failed') status = chain.opened ? 'failed' : 'closed';
      else if (chain.opened) status = 'open';
      else if (chain.seen) status = 'missed';
      else status = 'hidden';
      const base = { id: def.id, icon: def.icon, title: def.title, status, stage: chain.stage };
      if (status === 'hidden') return base;
      if (status === 'missed') return { ...base, next: chainMissedNote(chain) };
      if (status === 'failed' || status === 'closed') return { ...base, next: chain.failReason };
      return { ...base, ...def.describe(chain, this) };
    });
  }

  // ── 결말 ─────────────────────────────────────

  setEnding(id, extra = {}) {
    if (this.ending) return;
    const def = ENDINGS[id];
    let text = def.text;
    if (id === 'died') text = `${josa(extra.cause, '으로/로')} 쓰러졌다. ${def.text}`;
    if (extra.leftBehind?.length) text += ` 옥상에 남겨진 ${extra.leftBehind.join(', ')}의 모습이 눈에 밟힌다.`;
    this.ending = {
      id,
      type: def.type,
      title: def.title,
      text,
      day: this.day,
      runs: this.runs,
      survivors: this.presentPeople().map((p) => p.name),
      lost: this.people.filter((p) => p.status === 'dead' || p.status === 'lost' || p.status === 'left').map((p) => p.name),
      ...extra,
    };
    this.phase = 'ending';
  }
}
