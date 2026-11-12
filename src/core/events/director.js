// 사건 감독: 그날 일어날 사건을 정한다.
//  1) 예약된 연쇄 사건(탈출 경로·미션)이 있으면 그것이 우선이다. 예약일은 서로 겹치지 않게 잡으므로
//     한 번 예약된 단계는 반드시 그날 일어난다.
//     탈출 경로는 게임을 시작할 때 첫 단계 날짜가 정해지고, 미션(trigger: 'manual')은
//     무작위 사건에서 수락했을 때 비로소 예약된다.
//  2) 없으면 DAILY_EVENT_CHANCE 확률로 무작위 사건이 일어난다.
//  3) 사건 없는 날이 MAX_QUIET_DAYS 만큼 이어졌으면 다음 날은 조건을 만족하는 사건이 반드시 일어난다.
//  4) 연쇄 사건이 있는 날에는 미션 사건(bonus: true)이 덤으로 하나 더 일어날 수 있다(pickBonus).
//     탈출 경로 사건이 날짜를 다 차지해 미션을 만나지 못하는 일을 막는다.
import { CALM_DAYS, DAILY_EVENT_CHANCE, MAX_QUIET_DAYS } from '../constants.js';

export const BONUS_MISSION_CHANCE = 0.5; // 연쇄 사건이 있는 날, 미션 사건이 덤으로 하나 더 일어날 확률

export class EventDirector {
  constructor({
    rng,
    chains,
    randomEvents,
    maxQuiet = MAX_QUIET_DAYS,
    chance = DAILY_EVENT_CHANCE,
    calmDays = CALM_DAYS,
  }) {
    this.rng = rng;
    this.randomEvents = randomEvents;
    this.chainDefs = chains;
    this.maxQuiet = maxQuiet;
    this.chance = chance;
    this.calmDays = calmDays;
    this.quietStreak = 0;
    this.history = []; // { day, defId, kind: 'chain'|'random'|'forced'|'quiet'|'calm' }
    this.counts = {};
    this.lastDay = {};
    this.today = 0;
    this.chains = {};
    chains.forEach((def, order) => {
      const chain = {
        id: def.id,
        order,
        kind: def.trigger === 'manual' ? 'mission' : 'path',
        stage: 0,
        status: 'idle', // idle(아직 시작 안 함) | scheduled | active | done | failed
        due: null,
        retries: 0,
        opened: false, // 경로가 열렸는지(첫 단계에서 수락)
        seen: false, // 첫 단계 사건을 한 번이라도 겪었는지
        data: def.initData ? def.initData() : {},
        log: [], // { stage, day, scheduledFor }
        failReason: null,
        result: null, // 미션이 끝났을 때 남기는 한 줄 결과
      };
      this.chains[def.id] = chain;
      if (def.trigger !== 'manual') this.schedule(chain, this.rng.int(def.openWindow[0], def.openWindow[1]));
    });
  }

  /**
   * wanted 날짜 이후의 빈 날로 예약한다.
   * 탈출 경로끼리는 서로 날짜를 피하고, 미션은 모든 예약을 피한다.
   * 탈출 경로가 미션과 같은 날에 잡히면 미션 쪽이 다음 빈 날로 밀린다(탈출 일정이 우선).
   */
  schedule(chain, wanted) {
    let day = Math.max(wanted, this.today + 1);
    const others = Object.values(this.chains).filter((c) => c !== chain && c.status === 'scheduled');
    const isPath = chain.kind === 'path';
    const blockers = isPath ? others.filter((c) => c.kind === 'path') : others;
    while (blockers.some((c) => c.due === day)) day += 1;
    chain.status = 'scheduled';
    chain.due = day;
    if (isPath) {
      for (const mission of others.filter((c) => c.kind !== 'path' && c.due === day)) this.schedule(mission, day + 1);
    }
    return day;
  }

  /** 연쇄 사건 선택지가 다음 일정을 정할 때 쓰는 제어기 */
  controller(chainId, day) {
    const chain = this.chains[chainId];
    const rangeDay = ([min, max]) => day + this.rng.int(min, max);
    return {
      state: chain,
      data: chain.data,
      open: () => {
        chain.opened = true;
      },
      /** 미션 시작: 첫 단계를 며칠 뒤로 예약한다 */
      begin: (range) => {
        chain.opened = true;
        chain.seen = true;
        chain.stage = 0;
        chain.retries = 0;
        return this.schedule(chain, rangeDay(range));
      },
      /** 지정한 단계로 되돌아가 다시 예약한다(되풀이되는 미션) */
      goto: (stage, range) => {
        chain.stage = stage;
        chain.retries = 0;
        return this.schedule(chain, rangeDay(range));
      },
      advance: (range) => {
        chain.stage += 1;
        chain.retries = 0;
        return this.schedule(chain, rangeDay(range));
      },
      retry: (range) => {
        chain.retries += 1;
        return this.schedule(chain, rangeDay(range));
      },
      complete: (result = null) => {
        chain.status = 'done';
        chain.due = null;
        chain.result = result;
      },
      fail: (reason) => {
        chain.status = 'failed';
        chain.due = null;
        chain.failReason = reason;
      },
    };
  }

  stageDefId(chain) {
    return this.chainDefs[chain.order].stages[chain.stage].id;
  }

  /** day일의 사건을 정한다. 사건이 없으면 null. */
  pick(day, game) {
    this.today = day;
    const due = Object.values(this.chains)
      .filter((c) => c.status === 'scheduled' && c.due <= day)
      .sort((a, b) => a.due - b.due || a.order - b.order);
    if (due.length) {
      const chain = due[0];
      chain.status = 'active';
      if (chain.stage === 0) chain.seen = true;
      chain.log.push({ stage: chain.stage, day, scheduledFor: chain.due });
      const def = this.chainDefs[chain.order].stages[chain.stage];
      return this.record(
        day,
        { defId: def.id, chainId: chain.id, stage: chain.stage, day, params: def.setup?.(game, this.rng) ?? {} },
        'chain',
      );
    }

    if (day <= this.calmDays) return this.record(day, null, 'calm');

    const forced = this.quietStreak >= this.maxQuiet;
    if (forced || this.rng.chance(this.chance)) {
      const def = this.chooseRandom(day, game, forced);
      if (def) {
        return this.record(day, { defId: def.id, chainId: null, day, params: def.setup?.(game, this.rng) ?? {} }, forced ? 'forced' : 'random');
      }
    }
    return this.record(day, null, 'quiet');
  }

  /** 오늘의 연쇄 사건을 해결한 뒤 덤으로 일어나는 미션 사건. 없으면 null. */
  pickBonus(day, game) {
    if (day <= this.calmDays || !this.rng.chance(BONUS_MISSION_CHANCE)) return null;
    const pool = this.randomEvents.filter((def) => def.bonus && this.eligible(def, day, game, true));
    if (!pool.length) return null;
    const def = this.rng.weighted(pool, (d) => d.weight ?? 1);
    const inst = { defId: def.id, chainId: null, day, params: def.setup?.(game, this.rng) ?? {} };
    this.history.push({ day, defId: def.id, kind: 'bonus' });
    this.counts[def.id] = (this.counts[def.id] ?? 0) + 1;
    this.lastDay[def.id] = day;
    return inst;
  }

  /** 닫힌 탈출 경로를 처음부터 다시 연다(모든 경로가 닫혀 이길 길이 없어졌을 때). */
  reopen(chainId, day) {
    const chain = this.chains[chainId];
    const def = this.chainDefs[chain.order];
    chain.stage = 0;
    chain.retries = 0;
    chain.opened = false;
    chain.failReason = null;
    chain.reopened = (chain.reopened ?? 0) + 1;
    chain.data = def.initData ? def.initData() : {};
    return this.schedule(chain, day);
  }

  eligible(def, day, game, strict) {
    if ((this.counts[def.id] ?? 0) >= (def.maxCount ?? Infinity)) return false;
    if (def.when && !def.when(game)) return false;
    if (strict) {
      if (day < (def.minDay ?? 1)) return false;
      const last = this.lastDay[def.id];
      if (last != null && day - last <= (def.cooldown ?? 0)) return false;
    }
    return true;
  }

  chooseRandom(day, game, forced) {
    let pool = this.randomEvents.filter((def) => this.eligible(def, day, game, true));
    // 반드시 일어나야 하는 날에는 재사용 대기·최소 날짜를 무시하고라도 조건을 만족하는 사건을 고른다.
    if (!pool.length && forced) pool = this.randomEvents.filter((def) => this.eligible(def, day, game, false));
    if (!pool.length) return null;
    return this.rng.weighted(pool, (def) => def.weight ?? 1);
  }

  record(day, inst, kind) {
    this.history.push({ day, defId: inst?.defId ?? null, kind });
    if (inst) {
      this.quietStreak = 0;
      if (!inst.chainId) {
        this.counts[inst.defId] = (this.counts[inst.defId] ?? 0) + 1;
        this.lastDay[inst.defId] = day;
      }
    } else {
      this.quietStreak += 1;
    }
    return inst;
  }
}
