// 게임 전체 흐름: 60초 탐색(물자·가족을 집으로) → 하루 단위 생존(사건·배급·탐사) → 결말.
// 화면(DOM)과 분리되어 있어 테스트에서 그대로 조작할 수 있다.
import {
  EXPEDITION_DAYS,
  HEALTH_DEATH,
  HUNGER_DEATH,
  INJURY_WORSEN_DAYS,
  THIRST_DEATH,
} from './constants.js';
import { ENDINGS } from './endings.js';
import { CHAINS, EVENT_DEFS, RANDOM_EVENTS } from './events/index.js';
import { chainMissedNote } from './events/chains.js';
import { EventDirector } from './events/director.js';
import { EXPEDITION_TARGETS, expeditionRisk, rollLoot, targetOf } from './expedition.js';
import { Inventory, isPerson } from './inventory.js';
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
import { createRun, stepRun } from './run.js';
import { josa } from './text.js';
import { FAMILY_SPOTS, initialMartStock, martSummary } from './world.js';

const evaluate = (value, ...args) => (typeof value === 'function' ? value(...args) : value);

export class Game {
  constructor({ seed = randomSeed(), zombies = true } = {}) {
    this.seed = seed;
    const root = new Rng(seed);
    this.rng = { schedule: root.fork('schedule'), outcome: root.fork('outcome'), run: root.fork('run') };
    this.zombies = zombies;

    this.phase = 'ready'; // ready → run → home → ending
    this.day = 0;
    this.people = [createPerson(PLAYER_DEF, 'home'), ...FAMILY_DEFS.map((def) => createPerson(def, 'outside'))];
    this.stock = emptyStock();
    this.inventory = new Inventory();
    this.martStock = initialMartStock();

    this.run = null;
    this.lastRun = null;

    this.expedition = null; // { memberId, targetId, withWeapon, departDay, returnDay }
    this.expeditions = 0; // 떠난 탐사 수(많을수록 위험)
    this.expeditionReport = null; // 오늘 아침 돌아온 탐사 결과
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

  // ── 60초 탐색 ────────────────────────────────

  startFirstRun() {
    if (this.phase !== 'ready') return false;
    this.run = createRun({
      inventory: this.inventory,
      martStock: this.martStock,
      rng: this.rng.run,
      playerHealth: this.me.health,
      family: FAMILY_DEFS.map((def) => ({ id: def.id, ...FAMILY_SPOTS[def.id] })),
      zombies: this.zombies,
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

  finishRun() {
    const run = this.run;
    const items = run.delivered.filter((id) => !isPerson(id));
    const family = run.delivered.filter(isPerson);
    this.lastRun = {
      outcome: run.outcome,
      endedBy: run.endedBy,
      delivered: [...run.delivered],
      items,
      family,
      timeLeft: run.timeLeft,
      elapsed: run.elapsed,
    };
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
    }
    this.inventory.takeAll();
    this.run = null;
    const names = items.map((id) => ITEMS[id].name);
    this.addLog(
      `${run.endedBy === 'enter' ? `남은 ${run.timeLeft.toFixed(1)}초를 두고 집에 들어가 문을 잠갔다.` : '60초가 끝날 때 무사히 집 문간에 있었다.'} 들여놓은 물품: ${names.length ? names.join(', ') : '없음'}`,
      'good',
    );
    const brought = this.people.filter((p) => family.includes(p.id)).map((p) => p.name);
    const left = this.people.filter((p) => p.status === 'left').map((p) => p.name);
    if (brought.length) this.addLog(`함께 집에 들어온 가족: ${brought.join(', ')}`, 'good');
    if (left.length) this.addLog(`데려오지 못한 가족: ${left.join(', ')}`, 'warn');
    this.phase = 'home';
    this.day = 1;
    this.startDay();
    this.emit();
  }

  // ── 탐사 ─────────────────────────────────────

  expeditionTargets() {
    return EXPEDITION_TARGETS.map((t) => ({
      ...t,
      remaining: t.items.reduce((sum, id) => sum + (this.martSummary()[id] ?? 0), 0),
    }));
  }

  expeditionRisk(memberId, withWeapon = false) {
    return expeditionRisk(this.person(memberId), { withWeapon, count: this.expeditions });
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

  sendExpedition({ memberId, targetId = 'supplies', withWeapon = false }) {
    if (this.expeditionReason(memberId)) return false;
    const p = this.person(memberId);
    const weapon = withWeapon && this.stock.weapon > 0;
    if (weapon) this.stock.weapon -= 1;
    const [min, max] = EXPEDITION_DAYS;
    this.expedition = {
      memberId,
      targetId: targetOf(targetId).id,
      withWeapon: weapon,
      departDay: this.day,
      returnDay: this.day + this.rng.outcome.int(min, max),
      risk: this.expeditionRisk(memberId, weapon),
    };
    this.expeditions += 1;
    p.status = 'away';
    this.addLog(
      `${josa(p.name, '이/가')} ${josa(targetOf(targetId).name, '을/를')} 찾으러 마트로 탐사를 떠났다${weapon ? ' (야구 방망이를 챙김)' : ''}.`,
      'event',
    );
    this.syncRations();
    this.emit();
    return true;
  }

  /** 아침에 탐사자가 돌아오는지 확인한다. */
  resolveExpedition() {
    const exp = this.expedition;
    if (!exp || exp.returnDay > this.day) return;
    this.expedition = null;
    const p = this.person(exp.memberId);
    const rng = this.rng.outcome;
    const days = this.day - exp.departDay;
    const report = { day: this.day, memberId: p.id, name: p.name, targetId: exp.targetId, items: [], extra: { food: 0, water: 0 } };

    if (rng.chance(exp.risk.lost)) {
      p.status = 'lost';
      report.outcome = 'lost';
      report.text = `${josa(p.name, '이/가')} 탐사에서 돌아오지 않았다.`;
      this.expeditionReport = report;
      this.addLog(report.text, 'bad');
      if (p.isPlayer) this.setEnding('lost');
      return;
    }

    p.status = 'home';
    p.hunger = Math.min(p.hunger + days, 3);
    p.thirst = Math.min(p.thirst + days, 2);
    const loot = rollLoot({ martStock: this.martStock, targetId: exp.targetId, rng });
    for (const id of loot.items) {
      for (const [key, n] of Object.entries(ITEMS[id].gives)) this.stock[key] += n;
    }
    this.stock.food += loot.extra.food;
    this.stock.water += loot.extra.water;
    if (exp.withWeapon) this.stock.weapon += 1;
    report.items = loot.items;
    report.extra = loot.extra;
    report.foundTarget = loot.foundTarget;

    const injured = rng.chance(exp.risk.injury);
    if (injured) p.health = Math.min(HEALTH_DEATH - 1, p.health + 1);
    report.outcome = injured ? 'injured' : 'returned';
    const names = loot.items.map((id) => ITEMS[id].name);
    const extraText = formatResources(loot.extra);
    const found = names.length ? names.join(', ') : '마트에서 쓸 만한 것을 찾지 못했다';
    report.text = `${josa(p.name, '이/가')} ${days}일 만에 돌아왔다. 가져온 것: ${found}${extraText ? ` · 길에서 주운 것: ${extraText}` : ''}${
      injured ? ` · ${josa(p.name, '은/는')} 다쳐서 돌아왔다 (${healthLabel(p.health).text})` : ''
    }`;
    this.expeditionReport = report;
    this.addLog(report.text, injured ? 'warn' : 'good');
  }

  // ── 하루 ─────────────────────────────────────

  startDay() {
    this.momCaredToday = false;
    for (const p of this.people) p.treatedToday = false;
    this.resolveExpedition();
    if (this.ending) return;
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

  // ── 결말 ─────────────────────────────────────

  setEnding(id, extra = {}) {
    if (this.ending) return;
    const def = ENDINGS[id];
    let text = def.text;
    if (id === 'died') text = `${josa(extra.cause, '으로/로')} 쓰러졌다. ${def.text}`;
    if (extra.leftBehind?.length) text += ` 옥상에 남겨진 ${extra.leftBehind.join(', ')}의 모습이 눈에 밟힌다.`;
    // 탈출하는 날 탐사를 나가 있던 사람은 함께 가지 못한다.
    const awayAtEscape = def.type === 'victory' ? this.people.filter((p) => p.status === 'away') : [];
    for (const p of awayAtEscape) p.status = 'lost';
    if (awayAtEscape.length) text += ` 탐사를 나간 ${awayAtEscape.map((p) => p.name).join(', ')}을 기다릴 수 없었다.`;
    this.ending = {
      id,
      type: def.type,
      title: def.title,
      text,
      day: this.day,
      expeditions: this.expeditions,
      survivors: this.presentPeople().map((p) => p.name),
      lost: this.people.filter((p) => ['dead', 'lost', 'left'].includes(p.status)).map((p) => p.name),
      ...extra,
    };
    this.phase = 'ending';
  }
}
