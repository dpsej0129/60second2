// 승리 경로가 되는 연쇄 사건. 각 단계는 앞 단계가 끝난 뒤에야 무작위 날짜로 예약된다.
// 모든 단계에는 항상 고를 수 있는 선택지가 있고, 그 선택지는 반드시 다음 일정(재시도·진행·종료)을 정한다.
import { SERVINGS, formatAmount } from '../items.js';
import { isCapable } from '../people.js';
import { josa } from '../text.js';

const CAN = SERVINGS;
const tribute = (d) => `${formatAmount('food', d.food)}, ${formatAmount('water', d.water)}`;
import { allOf, canTransmit, criticalPeople, needCapable, needStock } from './helpers.js';

const OPENER_RETRIES = { rescue: 2, group: 1, car: 1, safezone: 1, caravan: 1, train: 1 };

const when = (chain) => (chain.status === 'active' ? '오늘' : `${chain.due}일차`);

// ── 군 구조 헬기 ─────────────────────────────────

function respondToRescue(ctx, via) {
  ctx.take('battery', 1);
  ctx.chain.open();
  ctx.chain.data.via = via;
  const day = ctx.chain.advance([8, 14]);
  const lead =
    via === 'sis'
      ? '동생이 라디오 뒷판을 뜯어 송신기로 개조했다. 지직거리는 잡음 끝에 목소리가 돌아왔다.'
      : '무전기 송신 버튼을 눌렀다. 지직거리는 잡음 끝에 목소리가 돌아왔다.';
  return `${lead} "생존자 확인. ${day}일차에 다시 교신하겠다. 무전을 켜 둘 건전지를 남겨 두어라." 헬기가 오면 신호탄으로 위치를 알려야 하고, 걷지 못하는 중상자는 태울 수 없다고 한다. (건전지 -1)`;
}

const RESCUE = {
  id: 'rescue',
  icon: '🚁',
  title: '군 구조 헬기',
  openWindow: [14, 32],
  initData: () => ({ via: null, arrivalDay: null, missed: 0 }),
  stages: [
    {
      id: 'rescue_call',
      title: '구조 무전',
      text(game, params, chain) {
        const base =
          '거실의 낡은 라디오에서 잡음 섞인 방송이 흘러나온다. "여기는 국군 구조대. 생존자는 이 주파수로 응답하라. 반복한다…"';
        return chain.retries > 0 ? `같은 주파수에서 구조 방송이 다시 들린다. (${chain.retries + 1}번째) ${base}` : base;
      },
      options: [
        {
          id: 'radio',
          label: '무전기로 응답한다',
          cost: '건전지 1',
          check: allOf(needStock('radio'), needStock('battery')),
          resolve: (ctx) => respondToRescue(ctx, 'radio'),
        },
        {
          id: 'sis',
          who: 'sis',
          label: '동생이 라디오를 개조해 응답한다',
          cost: '건전지 1',
          check: allOf(needCapable('sis'), needStock('battery')),
          resolve: (ctx) => respondToRescue(ctx, 'sis'),
        },
        {
          id: 'ignore',
          label: '응답하지 않는다',
          note: (game, params, chain) =>
            chain.retries < OPENER_RETRIES.rescue
              ? `며칠 뒤 방송이 다시 들릴 수 있다 (남은 기회 ${OPENER_RETRIES.rescue - chain.retries}번)`
              : '마지막 방송이다',
          resolve(ctx) {
            if (ctx.chain.state.retries < OPENER_RETRIES.rescue) {
              ctx.chain.retry([10, 18]);
              return '방송이 잡음 속으로 사라졌다. 언젠가 다시 들릴지도 모른다.';
            }
            ctx.chain.fail('구조 방송이 더 이상 들리지 않는다.');
            return '방송이 끊겼다. 다시는 들리지 않았다.';
          },
        },
      ],
    },
    {
      id: 'rescue_coords',
      title: '구조대 교신',
      text: () => '약속한 시간, 무전기에서 구조대의 목소리가 들린다. "착륙 지점을 확정하겠다. 현재 위치를 보고하라."',
      options: [
        {
          id: 'report',
          label: '위치를 보고한다',
          cost: '건전지 1',
          check: allOf(needStock('battery'), canTransmit),
          resolve(ctx) {
            ctx.take('battery', 1);
            const day = ctx.chain.advance([8, 14]);
            ctx.chain.data.arrivalDay = day;
            return `"확인했다. ${day}일차에 헬기가 옥상에 도착한다. 신호탄으로 위치를 알려라. 걷지 못하는 사람은 태울 수 없다." (건전지 -1)`;
          },
        },
        {
          id: 'later',
          label: '지금은 교신할 수 없다',
          note: '구조대가 며칠 뒤 다시 연락할지도 모른다',
          resolve(ctx) {
            const day = ctx.chain.retry([3, 6]);
            return `응답하지 못하자 교신이 끊겼다. 끊기기 직전 "${day}일차에 다시 연락하겠다"는 말이 들렸다.`;
          },
        },
      ],
    },
    {
      id: 'rescue_arrival',
      title: '구조 헬기 도착',
      text: (game, params, chain) =>
        `멀리서 프로펠러 소리가 들린다. 구조 헬기가 상공을 맴돌며 신호를 찾고 있다!${chain.data.missed ? ' 구조대가 말한 마지막 기회다.' : ''}`,
      options: [
        {
          id: 'flare',
          label: '신호탄을 쏴 헬기를 부른다',
          cost: '신호탄 1',
          check: allOf(needStock('flare'), (game) => {
            const critical = criticalPeople(game);
            return critical.length ? `걷지 못하는 중상자가 있다 (${critical.map((p) => p.name).join(', ')})` : null;
          }),
          resolve(ctx) {
            ctx.take('flare', 1);
            ctx.chain.complete();
            ctx.win('rescue');
            const away = ctx.game.expedition ? ctx.game.person(ctx.game.expedition.memberId) : null;
            return away
              ? `붉은 신호탄이 하늘을 갈랐다. 헬기가 옥상에 내려앉았다. 탐사를 나간 ${josa(away.name, '을/를')} 끝내 기다리지 못하고 줄사다리를 올랐다.`
              : '붉은 신호탄이 하늘을 갈랐다. 헬기가 옥상에 내려앉고, 모두가 줄사다리를 올랐다.';
          },
        },
        {
          id: 'flare_leave',
          label: '신호탄을 쏘고, 걷지 못하는 가족을 두고 떠난다',
          cost: '신호탄 1',
          check: allOf(needStock('flare'), (game) => {
            if (game.me.health >= 2) return '나 자신이 중상이라 헬기에 오를 수 없다';
            return criticalPeople(game).length ? null : '두고 갈 중상자가 없다';
          }),
          resolve(ctx) {
            ctx.take('flare', 1);
            const left = criticalPeople(ctx.game);
            for (const p of left) {
              p.status = 'lost';
              p.fate = '걷지 못해 옥상에 남겨졌다.';
            }
            ctx.chain.complete();
            ctx.win('rescue', { leftBehind: left.map((p) => p.name) });
            return `신호탄을 쏘아 올렸다. ${left.map((p) => p.name).join(', ')}의 손을 놓고 줄사다리를 올랐다.`;
          },
        },
        {
          id: 'pass',
          label: '이번에는 헬기를 보낸다',
          note: (game, params, chain) => (chain.data.missed ? '다시는 오지 않을 것이다' : '헬기가 위치를 찾지 못할 것이다'),
          resolve(ctx) {
            const data = ctx.chain.data;
            if (data.missed < 1) {
              data.missed += 1;
              const day = ctx.chain.retry([3, 3]);
              data.arrivalDay = day;
              return `헬기는 위치를 찾지 못하고 돌아갔다. 무전으로 짧은 연락이 왔다. "${day}일차, 마지막으로 한 번 더 오겠다."`;
            }
            ctx.chain.fail('구조 헬기는 다시 오지 않는다.');
            return '헬기 소리가 멀어진다. 구조대는 다시 오지 않았다.';
          },
        },
      ],
    },
  ],
  describe(chain, game) {
    const d = chain.data;
    const critical = criticalPeople(game);
    const sis = game.person('sis');
    const steps = [
      { text: '구조 방송에 응답', done: chain.stage >= 1 },
      { text: '구조대에 위치 보고', done: chain.stage >= 2 },
      { text: '헬기 도착일에 신호탄 발사', done: chain.status === 'done' },
    ];
    const requirements = [];
    if (chain.stage <= 1) {
      requirements.push({ text: '교신용 건전지', have: game.stock.battery, need: 1 });
      requirements.push({ text: '송신 수단 (무전기 또는 동생)', ok: game.stock.radio > 0 || isCapable(sis) });
    }
    requirements.push({ text: '신호탄', have: game.stock.flare, need: 1 });
    requirements.push({
      text: '걷지 못하는 중상자 없음',
      ok: critical.length === 0,
      detail: critical.length ? `중상: ${critical.map((p) => p.name).join(', ')}` : null,
    });
    let next = '';
    let schedule = null;
    const todo = [];
    if (chain.stage <= 1 && game.stock.battery < 1) todo.push('교신용 건전지를 구해 두자');
    if (game.stock.flare < 1) todo.push('헬기가 오기 전에 탐사로 신호탄을 구해 오자');
    if (critical.length) todo.push(`중상자(${critical.map((p) => p.name).join(', ')})를 구급약으로 치료해 두자`);
    const tail = todo.length ? ` ${todo.join('. ')}.` : ' 준비는 끝났다. 그날까지 버티자.';
    if (chain.stage === 1) {
      schedule = `다음 교신: ${when(chain)}`;
      next = `${when(chain)}에 구조대가 다시 교신한다.${tail}`;
    } else if (chain.stage === 2) {
      schedule = `헬기 도착: ${when(chain)}`;
      next = `${when(chain)}에 헬기가 온다.${tail}${d.missed ? ' 이번이 마지막 기회다.' : ''}`;
    }
    return { steps, requirements, next, schedule };
  },
};

// ── 강변 거점 합류 ───────────────────────────────

function openGroup(ctx, food, water, lead) {
  ctx.chain.open();
  Object.assign(ctx.chain.data, { food, water });
  const day = ctx.chain.advance([8, 14]);
  return `${lead} "우리 거점은 담장도 있고 경비도 선다. 대신 빈손으로는 받아 줄 수 없다. 합류하는 날 ${tribute({ food, water })}. 그게 조건이다. ${day}일차에 다시 들르겠다."`;
}

function finishTrustTest(ctx, lead) {
  const d = ctx.chain.data;
  const day = ctx.chain.advance([8, 14]);
  d.joinDay = day;
  return `${lead} "${day}일차에 데리러 오겠다. ${tribute(d)}. 잊지 마라."`;
}

const GROUP = {
  id: 'group',
  icon: '🏚️',
  title: '강변 거점 합류',
  openWindow: [20, 40],
  initData: () => ({ food: 3 * CAN, water: 3 * CAN, trust: null, joinDay: null, delays: 0 }),
  stages: [
    {
      id: 'group_scout',
      title: '낯선 생존자',
      text: (game, params, chain) =>
        chain.retries
          ? '그 낯선 생존자가 다시 찾아왔다. "마지막으로 묻겠다. 강변 물류창고 거점에 합류할 생각 있나?"'
          : '누군가 현관문을 세 번 두드린다. "강변 물류창고 거점에서 왔다. 사람을 모으고 있다. 얘기 좀 하지."',
      options: [
        {
          id: 'talk',
          label: '문을 열고 교섭한다',
          resolve: (ctx) => openGroup(ctx, 3 * CAN, 3 * CAN, '상대는 총구를 내리고 조건을 말했다.'),
        },
        {
          id: 'dad',
          who: 'dad',
          label: '아빠가 문 앞에서 경계하며 교섭한다',
          check: needCapable('dad'),
          resolve: (ctx) => openGroup(ctx, 2 * CAN, 2 * CAN, '아빠의 단호한 태도에 상대가 한발 물러섰다.'),
        },
        {
          id: 'refuse',
          label: '문을 열지 않는다',
          note: (game, params, chain) =>
            chain.retries < OPENER_RETRIES.group ? '한 번 더 찾아올지도 모른다' : '다시는 오지 않을 것이다',
          resolve(ctx) {
            if (ctx.chain.state.retries < OPENER_RETRIES.group) {
              ctx.chain.retry([10, 18]);
              return '"생각이 바뀌면…" 발소리가 멀어졌다.';
            }
            ctx.chain.fail('거점 사람들은 더 이상 찾아오지 않는다.');
            return '그들은 다시 오지 않았다.';
          },
        },
      ],
    },
    {
      id: 'group_test',
      title: '거점의 부탁',
      text: () =>
        '거점의 정찰대원이 피투성이가 된 동료를 부축하고 찾아왔다. "우리 사람이 물렸다. 도와준다면 너희를 믿겠다."',
      options: [
        {
          id: 'med',
          label: '구급약을 건넨다',
          cost: '구급약 1',
          check: needStock('med'),
          resolve(ctx) {
            ctx.take('med', 1);
            ctx.chain.data.trust = 'high';
            return finishTrustTest(ctx, '구급약을 건네자 그들의 눈빛이 달라졌다.');
          },
        },
        {
          id: 'mom',
          who: 'mom',
          label: '엄마가 직접 치료해 준다',
          check: needCapable('mom'),
          resolve(ctx) {
            ctx.chain.data.trust = 'high';
            return finishTrustTest(ctx, '엄마가 능숙하게 상처를 꿰맸다. 정찰대원이 고개 숙여 고마워했다.');
          },
        },
        {
          id: 'refuse',
          label: '도울 여유가 없다',
          resolve(ctx) {
            const d = ctx.chain.data;
            d.food += 2 * CAN;
            d.water += 2 * CAN;
            d.trust = 'low';
            return finishTrustTest(ctx, '"그렇군." 정찰대원의 표정이 굳었다. "그렇다면 조건을 올리겠다."');
          },
        },
      ],
    },
    {
      id: 'group_join',
      title: '합류의 날',
      text: (game, params, chain) =>
        `약속한 날, 거점 사람들이 트럭을 몰고 왔다. "약속한 물자는 준비됐나? ${tribute(chain.data)}."${chain.data.delays ? ' 이번이 마지막 기회다.' : ''}`,
      options: [
        {
          id: 'pay',
          label: '약속한 물자를 건네고 합류한다',
          cost: (game, params, chain) => tribute(chain.data),
          check: (game, params, chain) =>
            needStock('food', chain.data.food)(game) ?? needStock('water', chain.data.water)(game),
          resolve(ctx) {
            ctx.take('food', ctx.chain.data.food);
            ctx.take('water', ctx.chain.data.water);
            ctx.chain.complete();
            ctx.win('group');
            return '물자를 트럭에 싣고, 가족과 함께 짐칸에 올랐다.';
          },
        },
        {
          id: 'delay',
          label: '아직 물자가 부족하다',
          note: (game, params, chain) => (chain.data.delays ? '다시는 오지 않을 것이다' : '조금 더 기다려 줄지도 모른다'),
          resolve(ctx) {
            const d = ctx.chain.data;
            if (d.delays < 1) {
              d.delays += 1;
              const day = ctx.chain.retry([3, 3]);
              d.joinDay = day;
              return `"사흘 주겠다. ${day}일차에도 없으면 없던 일이다."`;
            }
            ctx.chain.fail('거점은 더 이상 기다려 주지 않는다.');
            return '트럭이 먼지를 일으키며 떠났다. 다시 오지 않을 것이다.';
          },
        },
      ],
    },
  ],
  describe(chain, game) {
    const d = chain.data;
    const steps = [
      { text: '거점 사람과 교섭', done: chain.stage >= 1 },
      { text: '거점의 부탁 들어주기', done: chain.stage >= 2 },
      { text: '합류의 날 물자 전달', done: chain.status === 'done' },
    ];
    const requirements = [
      { text: '식량 (합류 날 재고)', have: game.stock.food, need: d.food },
      { text: '물 (합류 날 재고)', have: game.stock.water, need: d.water },
    ];
    let next = '';
    let schedule = null;
    const short = [];
    if (game.stock.food < d.food) short.push(formatAmount('food', d.food - game.stock.food));
    if (game.stock.water < d.water) short.push(formatAmount('water', d.water - game.stock.water));
    const gather = short.length
      ? `지금 재고로는 ${short.join(', ')}만큼 모자라다. 탐사로 채우자.`
      : '지금 재고로는 충분하지만, 그날까지 가족이 먹고 나서도 남아 있어야 한다.';
    if (chain.stage === 1) {
      schedule = `거점 사람 방문: ${when(chain)}`;
      next = `${when(chain)}에 거점 사람들이 다시 온다. 합류 날 낼 몫(${tribute(d)})을 따로 모아 두자. ${gather}`;
    } else if (chain.stage === 2) {
      schedule = `합류의 날: ${when(chain)}`;
      next = `${when(chain)}에 데리러 온다. 그날 아침 재고에 ${tribute(d)} 이상이 남아 있어야 한다. ${gather}${d.delays ? ' 이번이 마지막 기회다.' : ''}`;
    }
    return { steps, requirements, next, schedule };
  },
};

// ── 승합차 탈출 ──────────────────────────────────

function repaired(ctx, lead) {
  ctx.chain.data.repaired = true;
  const day = ctx.chain.advance([8, 14]);
  ctx.chain.data.departDay = day;
  return `${lead} 이제 연료통 2개와 도로 지도만 있으면 된다. ${day}일차에 출발 준비를 점검하자.`;
}

const CAR = {
  id: 'car',
  icon: '🚐',
  title: '승합차 탈출',
  openWindow: [24, 45],
  initData: () => ({ repaired: false, departDay: null }),
  stages: [
    {
      id: 'car_found',
      title: '옆집 차고',
      text: (game, params, chain) =>
        chain.retries
          ? '바람이 불 때마다 옆집 차고 문이 덜컹거린다. 그 승합차는 아직 그대로다.'
          : '옆집 차고 문이 바람에 열렸다. 기름이 바닥난 낡은 승합차가 서 있다. 열쇠는 꽂혀 있다.',
      options: [
        {
          id: 'inspect',
          label: '차를 살펴본다',
          resolve(ctx) {
            ctx.chain.open();
            const day = ctx.chain.advance([6, 12]);
            return `엔진에서 타는 냄새가 나고 연료는 한 방울도 없다. 엔진을 고치고 연료통 2개와 도로 지도를 구하면 도시를 빠져나갈 수 있을지도 모른다. ${day}일차에 엔진을 손보기로 했다.`;
          },
        },
        {
          id: 'ignore',
          label: '위험하다, 신경 쓰지 않는다',
          note: (game, params, chain) =>
            chain.retries < OPENER_RETRIES.car ? '아직은 차가 그대로 있을 것이다' : '차가 사라질 것이다',
          resolve(ctx) {
            if (ctx.chain.state.retries < OPENER_RETRIES.car) {
              ctx.chain.retry([10, 18]);
              return '차고 문을 닫아 두었다.';
            }
            ctx.chain.fail('누군가 승합차를 몰고 가 버렸다.');
            return '밤사이 엔진 소리가 나더니, 아침에 차고가 비어 있었다.';
          },
        },
      ],
    },
    {
      id: 'car_repair',
      title: '엔진 수리',
      text: () => '승합차의 시동을 걸어 보았다. 털털거리다 꺼져 버린다. 엔진을 손봐야 한다.',
      options: [
        {
          id: 'toolkit',
          label: '공구 상자로 고친다',
          check: needStock('toolkit'),
          resolve: (ctx) => repaired(ctx, '공구 상자를 들고 한나절 씨름한 끝에 엔진이 살아났다.'),
        },
        {
          id: 'sis',
          who: 'sis',
          label: '동생이 엔진을 고친다',
          check: needCapable('sis'),
          resolve: (ctx) => repaired(ctx, '동생이 손전등을 입에 물고 배선을 이리저리 바꾸더니, 엔진이 부르릉 살아났다!'),
        },
        {
          id: 'later',
          label: '나중에 고친다',
          note: '며칠 뒤 다시 시도한다',
          resolve(ctx) {
            const day = ctx.chain.retry([2, 4]);
            return `오늘은 손댈 수 없다. ${day}일차에 다시 시도하기로 했다.`;
          },
        },
      ],
    },
    {
      id: 'car_depart',
      title: '출발 준비',
      text: () => '승합차 앞에 가족이 모였다. 큰길은 좀비로 가득하지만, 지도만 있으면 빠져나갈 길이 있다.',
      options: [
        {
          id: 'go',
          label: '연료를 넣고 출발한다',
          cost: '연료통 2 · 도로 지도',
          check: allOf(needStock('fuel', 2), needStock('map')),
          resolve(ctx) {
            ctx.take('fuel', 2);
            ctx.chain.complete();
            ctx.win('car');
            return '연료를 가득 채우고 시동을 걸었다. 가족을 태운 승합차가 차고를 박차고 나갔다.';
          },
        },
        {
          id: 'wait',
          label: '아직 준비가 덜 됐다',
          note: '며칠 뒤 다시 점검한다',
          resolve(ctx) {
            const day = ctx.chain.retry([5, 9]);
            ctx.chain.data.departDay = day;
            return `준비가 끝날 때까지 기다리기로 했다. 다음 점검일: ${day}일차.`;
          },
        },
      ],
    },
  ],
  describe(chain, game) {
    const steps = [
      { text: '승합차 발견', done: chain.stage >= 1 },
      { text: '엔진 수리 (공구 상자 또는 동생)', done: chain.stage >= 2 },
      { text: '연료통 2개와 도로 지도로 출발', done: chain.status === 'done' },
    ];
    const requirements = [];
    if (chain.stage <= 1) {
      requirements.push({
        text: '수리 수단 (공구 상자 또는 동생)',
        ok: game.stock.toolkit > 0 || isCapable(game.person('sis')),
      });
    }
    requirements.push({ text: '연료통', have: game.stock.fuel, need: 2 });
    requirements.push({ text: '도로 지도', have: game.stock.map, need: 1 });
    let next = '';
    let schedule = null;
    const missing = [];
    if (game.stock.fuel < 2) missing.push(`연료통 ${2 - game.stock.fuel}개`);
    if (game.stock.map < 1) missing.push('도로 지도');
    const gear = missing.length ? `탐사로 ${missing.join('와 ')}를 구해 오자.` : '연료와 지도는 준비됐다.';
    if (chain.stage === 1) {
      const canFix = game.stock.toolkit > 0 || isCapable(game.person('sis'));
      schedule = `엔진 수리: ${when(chain)}`;
      next = `${when(chain)}에 엔진을 손본다. ${canFix ? '수리할 수단은 있다.' : '탐사로 공구 상자를 구해 오거나 동생이 움직일 수 있어야 한다.'} ${gear}`;
    } else if (chain.stage === 2) {
      schedule = `출발 점검: ${when(chain)}`;
      next = `${when(chain)}에 출발 여부를 점검한다. ${gear}`;
    }
    return { steps, requirements, next, schedule };
  },
};

// ── 남쪽 안전지대(걸어서 피난) ─────────────────────

/** 걸어서 떠나는 데 필요한 몫: 한 사람마다 통조림 1캔·물 1병 */
export function walkSupplies(game) {
  const n = game.presentPeople().length;
  return { food: n * CAN, water: n * CAN };
}

function scouted(ctx, lead) {
  const day = ctx.chain.advance([8, 14]);
  ctx.chain.data.departDay = day;
  return `${lead} ${day}일차 새벽에 떠나기로 했다. 걸어서 사흘, 한 사람마다 통조림 1캔과 물 1병은 챙겨야 한다. 걷지 못하는 사람은 데려갈 수 없다.`;
}

const SAFEZONE = {
  id: 'safezone',
  icon: '🚶',
  title: '남쪽 안전지대',
  openWindow: [28, 50],
  initData: () => ({ departDay: null, route: null }),
  stages: [
    {
      id: 'walk_rumor',
      title: '피난민 행렬',
      text: (game, params, chain) =>
        chain.retries
          ? '또 한 무리의 피난민이 짐을 지고 남쪽으로 걸어간다. 이번에도 맨 뒤의 노인이 우리 집 담벼락에 기대어 숨을 고른다.'
          : '창밖 길로 짐을 진 사람들이 줄지어 지나간다. 맨 뒤에 처진 노인이 우리 집 담벼락에 기대어 숨을 고른다.',
      options: [
        {
          id: 'ask',
          label: '물 한 모금을 건네고 어디로 가는지 묻는다',
          cost: '물 ¼병',
          check: needStock('water', 1),
          resolve(ctx) {
            ctx.take('water', 1);
            ctx.chain.open();
            const day = ctx.chain.advance([8, 14]);
            return `노인은 물을 단숨에 마셨다. "남쪽 저수지 너머에 군이 지키는 안전지대가 있다더군. 걸어서 사흘이야. 길을 먼저 알아 두게." ${day}일차쯤 길을 살펴보기로 했다. (물 -¼병)`;
          },
        },
        {
          id: 'listen',
          label: '창 너머로 이야기만 엿듣는다',
          resolve(ctx) {
            ctx.chain.open();
            const day = ctx.chain.advance([10, 16]);
            return `"남쪽… 저수지… 안전지대…" 띄엄띄엄 들린 말을 공책에 적어 두었다. ${day}일차쯤 길을 살펴보기로 했다.`;
          },
        },
        {
          id: 'ignore',
          label: '커튼을 닫는다',
          note: (game, params, chain) =>
            chain.retries < OPENER_RETRIES.safezone ? '피난민은 또 지나갈 것이다' : '이번이 마지막 행렬일지도 모른다',
          resolve(ctx) {
            if (ctx.chain.state.retries < OPENER_RETRIES.safezone) {
              ctx.chain.retry([10, 18]);
              return '발소리가 남쪽으로 멀어졌다.';
            }
            ctx.chain.fail('피난민 행렬이 더는 지나가지 않는다.');
            return '그 뒤로 길은 텅 비었다. 피난민은 다시 보이지 않았다.';
          },
        },
      ],
    },
    {
      id: 'walk_scout',
      title: '남쪽 길',
      text: () => '남쪽으로 가는 길을 누군가 먼저 살펴봐야 한다. 무너진 고가도로, 좀비가 모여 있는 사거리, 끊긴 다리…',
      options: [
        {
          id: 'map',
          label: '도로 지도로 우회로를 짠다',
          check: needStock('map'),
          resolve(ctx) {
            ctx.chain.data.route = 'map';
            return scouted(ctx, '도로 지도 위에 연필로 길을 그었다. 큰길을 피해 저수지까지 가는 뒷길이 있다.');
          },
        },
        {
          id: 'dad',
          who: 'dad',
          label: '아빠가 밤에 몰래 길을 살피고 온다',
          check: needCapable('dad'),
          resolve(ctx) {
            ctx.chain.data.route = 'dad';
            const dad = ctx.person('dad');
            const hurt = ctx.danger(0.25);
            if (hurt) ctx.injure(dad);
            return scouted(ctx, `새벽녘 돌아온 아빠가 숨을 몰아쉬었다. "길은 있어."${hurt ? ' 팔에 긁힌 상처가 길게 나 있다.' : ''}`);
          },
        },
        {
          id: 'me',
          label: '내가 직접 다녀온다',
          resolve(ctx) {
            ctx.chain.data.route = 'me';
            const hurt = ctx.danger(0.4);
            if (hurt) ctx.injure(ctx.game.me);
            return scouted(ctx, `밤새 골목을 기어 다녔다. 저수지 둑이 보이는 곳까지 갔다 왔다.${hurt ? ' 돌아오는 길에 넘어져 다리를 다쳤다.' : ''}`);
          },
        },
        {
          id: 'later',
          label: '지금은 나설 수 없다',
          note: '며칠 뒤 다시 생각한다',
          resolve(ctx) {
            const day = ctx.chain.retry([3, 6]);
            return `오늘은 무리다. ${day}일차에 다시 생각해 보기로 했다.`;
          },
        },
      ],
    },
    {
      id: 'walk_depart',
      title: '떠나는 새벽',
      text: (game) => {
        const need = walkSupplies(game);
        return `떠나기로 한 새벽이다. 배낭에 ${tribute(need)}을 나눠 담아야 한다. 걷지 못하는 사람이 있으면 데려갈 수 없다.`;
      },
      options: [
        {
          id: 'go',
          label: '배낭을 메고 남쪽으로 걷는다',
          cost: '한 사람마다 통조림 1캔·물 1병',
          check: (game) => {
            const need = walkSupplies(game);
            const critical = criticalPeople(game);
            if (critical.length || game.me.health >= 2) {
              return `걷지 못하는 사람이 있다 (${[...(game.me.health >= 2 ? ['나'] : []), ...critical.map((p) => p.name)].join(', ')})`;
            }
            return needStock('food', need.food)(game) ?? needStock('water', need.water)(game);
          },
          resolve(ctx) {
            const need = walkSupplies(ctx.game);
            ctx.take('food', need.food);
            ctx.take('water', need.water);
            ctx.chain.complete();
            ctx.win('safezone');
            return '문을 걸어 잠그고 열쇠를 우편함에 넣었다. 다시 돌아올 일은 없을 것이다. 남쪽으로 걸었다.';
          },
        },
        {
          id: 'wait',
          label: '아직 떠날 수 없다',
          note: '며칠 뒤 다시 새벽을 기다린다',
          resolve(ctx) {
            const day = ctx.chain.retry([5, 9]);
            ctx.chain.data.departDay = day;
            return `배낭을 다시 풀었다. ${day}일차 새벽에 다시 떠나 보기로 했다.`;
          },
        },
      ],
    },
  ],
  describe(chain, game) {
    const need = walkSupplies(game);
    const critical = criticalPeople(game);
    const steps = [
      { text: '피난민에게서 안전지대 이야기를 듣기', done: chain.stage >= 1 },
      { text: '남쪽 길 살펴보기 (지도·아빠·나)', done: chain.stage >= 2 },
      { text: '한 사람마다 통조림 1캔·물 1병을 챙겨 떠나기', done: chain.status === 'done' },
    ];
    const requirements = [
      { text: '식량 (떠나는 날 재고)', have: game.stock.food, need: need.food },
      { text: '물 (떠나는 날 재고)', have: game.stock.water, need: need.water },
      { text: '걷지 못하는 중상자 없음', ok: critical.length === 0 && game.me.health < 2 },
    ];
    const schedule = chain.stage >= 1 ? `${chain.stage === 1 ? '길 살펴보기' : '떠나는 날'}: ${when(chain)}` : null;
    const next = chain.stage === 1 ? `${when(chain)}에 남쪽 길을 살펴본다.` : `${when(chain)} 새벽에 떠난다. ${tribute(need)}이 필요하다.`;
    return { steps, requirements, next, schedule };
  },
};

// ── 떠돌이 상인 캐러밴 ─────────────────────────────

const CARAVAN_FARE = { battery: 2, water: CAN };

function caravanHired(ctx, lead) {
  const day = ctx.chain.advance([8, 14]);
  return `${lead} "좋아, 쓸모 있는 식구들이네. ${day}일차에 다시 들를게. 자리값은 건전지 두 개, 그리고 길에서 마실 물 한 병." 상인이 트럭 문을 두드리며 웃었다.`;
}

const CARAVAN = {
  id: 'caravan',
  icon: '🛻',
  title: '떠돌이 상인 캐러밴',
  openWindow: [34, 58],
  initData: () => ({ misses: 0 }),
  stages: [
    {
      id: 'caravan_meet',
      title: '상인 트럭',
      text: (game, params, chain) =>
        chain.retries
          ? '그 철판 트럭이 다시 집 앞에 섰다. "또 왔어요! 이번엔 얘기 좀 해 볼래요?"'
          : '덜컹거리는 소리와 함께 짐칸에 철판을 덧댄 트럭이 집 앞에 섰다. 운전석의 여자가 확성기로 외친다. "물물교환! 쓸 만한 거 있으면 나와 봐요!"',
      options: [
        {
          id: 'trade',
          label: '문틈으로 이야기를 나눈다',
          resolve(ctx) {
            ctx.chain.open();
            const day = ctx.chain.advance([8, 14]);
            return `여자는 도시와 도시 사이를 떠도는 상인이었다. "트럭에 자리가 좀 남아. 공짜는 아니고, 쓸모를 보여 주면 생각해 보지." ${day}일차에 다시 들른다고 했다.`;
          },
        },
        {
          id: 'ignore',
          label: '숨어서 기척을 죽인다',
          note: (game, params, chain) => (chain.retries < OPENER_RETRIES.caravan ? '트럭은 또 지나갈 것이다' : '다시는 들르지 않을 것이다'),
          resolve(ctx) {
            if (ctx.chain.state.retries < OPENER_RETRIES.caravan) {
              ctx.chain.retry([10, 18]);
              return '확성기 소리가 다음 골목으로 멀어졌다.';
            }
            ctx.chain.fail('상인 트럭이 더는 이 길로 오지 않는다.');
            return '트럭은 다시 오지 않았다.';
          },
        },
      ],
    },
    {
      id: 'caravan_job',
      title: '상인의 부탁',
      text: () => '상인 트럭이 약속대로 왔다. "발전기가 말썽이야. 고칠 수 있으면 자리를 내주지. 못 고치면 연료라도 좀 나눠 주든가."',
      options: [
        {
          id: 'sis',
          who: 'sis',
          label: '동생이 발전기를 고친다',
          check: needCapable('sis'),
          resolve: (ctx) => caravanHired(ctx, '동생이 발전기 덮개를 열고 한참 만지작거리더니, 꺼졌던 짐칸 전등이 반짝 들어왔다.'),
        },
        {
          id: 'toolkit',
          label: '공구 상자를 내준다',
          check: needStock('toolkit'),
          resolve(ctx) {
            ctx.take('toolkit', 1);
            return caravanHired(ctx, '공구 상자를 건넸다. 상인의 정비공이 반나절 만에 발전기를 살려 냈다. (공구 상자 -1)');
          },
        },
        {
          id: 'fuel',
          label: '연료통 하나를 넘긴다',
          check: needStock('fuel'),
          resolve(ctx) {
            ctx.take('fuel', 1);
            return caravanHired(ctx, '연료통을 굴려 트럭 옆에 세워 두었다. (연료통 -1)');
          },
        },
        {
          id: 'none',
          label: '도울 방법이 없다',
          note: (game, params, chain) => (chain.data.misses < 1 ? '한 번은 더 들를 것이다' : '다시는 오지 않을 것이다'),
          resolve(ctx) {
            if (ctx.chain.data.misses < 1) {
              ctx.chain.data.misses += 1;
              const day = ctx.chain.retry([6, 10]);
              return `"아쉽네. ${day}일차쯤 한 번 더 지나갈게."`;
            }
            ctx.chain.fail('상인은 다른 길을 찾아 떠났다.');
            return '상인은 어깨를 으쓱하고 트럭에 올랐다. 그 뒤로 다시 오지 않았다.';
          },
        },
      ],
    },
    {
      id: 'caravan_leave',
      title: '떠나는 트럭',
      text: () => '철판 트럭이 시동을 건 채 집 앞에 섰다. "자리 맡아 뒀어요. 건전지 두 개랑 물 한 병, 준비됐죠?"',
      options: [
        {
          id: 'go',
          label: '자리값을 내고 짐칸에 오른다',
          cost: '건전지 2 · 물 1병',
          check: allOf(needStock('battery', CARAVAN_FARE.battery), needStock('water', CARAVAN_FARE.water)),
          resolve(ctx) {
            ctx.take('battery', CARAVAN_FARE.battery);
            ctx.take('water', CARAVAN_FARE.water);
            ctx.chain.complete();
            ctx.win('caravan');
            return '건전지와 물병을 내밀자 상인이 짐칸 문을 열어 주었다. 덜컹, 트럭이 출발했다.';
          },
        },
        {
          id: 'wait',
          label: '다음에 가겠다고 한다',
          note: '다음 바퀴에 다시 들른다',
          resolve(ctx) {
            const day = ctx.chain.retry([6, 10]);
            return `"그럼 다음 바퀴에. ${day}일차쯤 다시 지나갈게."`;
          },
        },
      ],
    },
  ],
  describe(chain, game) {
    const steps = [
      { text: '상인과 이야기하기', done: chain.stage >= 1 },
      { text: '쓸모 보여 주기 (동생·공구 상자·연료통)', done: chain.stage >= 2 },
      { text: '자리값(건전지 2·물 1병)을 내고 떠나기', done: chain.status === 'done' },
    ];
    const requirements = [
      { text: '건전지', have: game.stock.battery, need: CARAVAN_FARE.battery },
      { text: '물', have: game.stock.water, need: CARAVAN_FARE.water },
    ];
    const schedule = chain.stage >= 1 ? `상인 트럭: ${when(chain)}` : null;
    const next = chain.stage === 1 ? `${when(chain)}에 상인이 들른다. 발전기를 고칠 방법(동생·공구 상자·연료통)이 있어야 한다.` : `${when(chain)}에 트럭이 떠난다. 건전지 2개와 물 1병이 필요하다.`;
    return { steps, requirements, next, schedule };
  },
};

// ── 마지막 피난 열차 ─────────────────────────────

/** 상처가 있는 사람(검역에서 걸린다): 주인공 포함 */
export function injuredPeople(game) {
  return game.presentPeople().filter((p) => p.health > 0);
}

function trainOpened(ctx, lead) {
  ctx.chain.open();
  const day = ctx.chain.advance([8, 14]);
  return `${lead} "중앙역 피난 열차 안내. 승차 등록은 역 앞 천막에서 받습니다." ${day}일차에 식구들 이름을 올리러 역에 다녀오기로 했다.`;
}

function registered(ctx, lead) {
  const day = ctx.chain.advance([8, 14]);
  return `${lead} "${day}일차 새벽 열차입니다. 타기 전에 검역을 합니다. 상처가 있는 사람은 태울 수 없어요." 등록증을 받아 왔다.`;
}

const TRAIN = {
  id: 'train',
  icon: '🚂',
  title: '마지막 피난 열차',
  openWindow: [40, 62],
  initData: () => ({}),
  stages: [
    {
      id: 'train_whistle',
      title: '먼 기적 소리',
      text: (game, params, chain) =>
        chain.retries
          ? '또 기적 소리가 들렸다. 지난번보다 가까운 것 같다.'
          : '새벽, 먼 곳에서 기적 소리가 길게 울렸다. 이 도시에 아직 기차가 다닌다?',
      options: [
        {
          id: 'radio',
          label: '무전기로 철도 방송을 찾는다',
          cost: '건전지 1',
          check: allOf(needStock('radio'), needStock('battery')),
          resolve(ctx) {
            ctx.take('battery', 1);
            return trainOpened(ctx, '다이얼을 한참 돌리자 딱딱한 안내 방송이 잡혔다. (건전지 -1)');
          },
        },
        {
          id: 'sis',
          who: 'sis',
          label: '동생이 라디오로 철도 무선을 잡는다',
          cost: '건전지 1',
          check: allOf(needCapable('sis'), needStock('battery')),
          resolve(ctx) {
            ctx.take('battery', 1);
            return trainOpened(ctx, '동생이 라디오 안테나를 창틀에 묶자 철도 무선이 또렷하게 들렸다. (건전지 -1)');
          },
        },
        {
          id: 'dad',
          who: 'dad',
          label: '아빠가 역까지 가서 알아본다',
          check: needCapable('dad'),
          resolve(ctx) {
            const dad = ctx.person('dad');
            const hurt = ctx.danger(0.3);
            if (hurt) ctx.injure(dad);
            return trainOpened(ctx, `해 질 녘 돌아온 아빠가 역 앞 게시판에서 베껴 온 쪽지를 내밀었다.${hurt ? ' 손등이 찢겨 피가 배어 있다.' : ''}`);
          },
        },
        {
          id: 'ignore',
          label: '헛것을 들었을 거라 생각한다',
          note: (game, params, chain) => (chain.retries < OPENER_RETRIES.train ? '기적 소리는 또 들릴 것이다' : '마지막 기적 소리일지도 모른다'),
          resolve(ctx) {
            if (ctx.chain.state.retries < OPENER_RETRIES.train) {
              ctx.chain.retry([10, 18]);
              return '기적 소리는 바람에 묻혔다.';
            }
            ctx.chain.fail('기적 소리가 더는 들리지 않는다.');
            return '그 뒤로 기적 소리는 다시 들리지 않았다.';
          },
        },
      ],
    },
    {
      id: 'train_register',
      title: '승차 등록',
      text: () => '역 앞 천막까지는 큰길을 두 번 건너야 한다. 누군가 식구들 이름을 올리러 다녀와야 한다.',
      options: [
        {
          id: 'dad',
          who: 'dad',
          label: '아빠가 다녀온다',
          check: needCapable('dad'),
          resolve(ctx) {
            const dad = ctx.person('dad');
            const hurt = ctx.danger(0.2);
            if (hurt) ctx.injure(dad);
            return registered(ctx, `아빠가 천막 앞 긴 줄에 한나절을 서 있었다.${hurt ? ' 돌아오는 길에 좀비와 맞닥뜨려 다리를 다쳤다.' : ''}`);
          },
        },
        {
          id: 'me',
          label: '내가 다녀온다',
          resolve(ctx) {
            const hurt = ctx.danger(0.35);
            if (hurt) ctx.injure(ctx.game.me);
            return registered(ctx, `천막에는 사람들이 길게 줄을 서 있었다.${hurt ? ' 돌아오는 길에 넘어져 팔을 크게 긁혔다.' : ''}`);
          },
        },
        {
          id: 'later',
          label: '오늘은 나설 수 없다',
          note: '며칠 뒤 다시 생각한다',
          resolve(ctx) {
            const day = ctx.chain.retry([3, 6]);
            return `오늘은 무리다. ${day}일차에 다시 가 보기로 했다.`;
          },
        },
      ],
    },
    {
      id: 'train_board',
      title: '피난 열차',
      text: () =>
        '중앙역 승강장. 방호복을 입은 검역관이 한 사람씩 몸을 살핀다. "상처가 있는 분은 태울 수 없습니다. 감염됐을지도 모르니까요."',
      options: [
        {
          id: 'board',
          label: '모두 검역을 받고 열차에 오른다',
          check: (game) => {
            const hurt = injuredPeople(game);
            return hurt.length ? `상처가 있는 사람이 있다 (${hurt.map((p) => p.name).join(', ')})` : null;
          },
          resolve(ctx) {
            ctx.chain.complete();
            ctx.win('train');
            return '검역관이 차례로 고개를 끄덕였다. 객차 문이 닫혔다.';
          },
        },
        {
          id: 'board_leave',
          label: '다친 식구를 두고 열차에 오른다',
          check: (game) => {
            if (game.me.health > 0) return '나도 다쳐서 검역을 통과할 수 없다';
            return injuredPeople(game).length ? null : '두고 갈 사람이 없다';
          },
          resolve(ctx) {
            const left = injuredPeople(ctx.game);
            for (const p of left) {
              p.status = 'lost';
              p.fate = '상처 때문에 검역을 통과하지 못해 승강장에 남겨졌다.';
            }
            ctx.chain.complete();
            ctx.win('train', { leftBehind: left.map((p) => p.name), leftPlace: '승강장에' });
            return `${left.map((p) => p.name).join(', ')}의 손을 놓았다. 열차 문이 닫혔다.`;
          },
        },
        {
          id: 'wait',
          label: '상처가 나을 때까지 다음 열차를 기다린다',
          note: '열차는 며칠마다 온다',
          resolve(ctx) {
            const day = ctx.chain.retry([5, 9]);
            return `승강장을 떠났다. 다음 열차는 ${day}일차 새벽이다.`;
          },
        },
      ],
    },
  ],
  describe(chain, game) {
    const hurt = injuredPeople(game);
    const steps = [
      { text: '철도 방송 듣기 (무전기·동생·아빠)', done: chain.stage >= 1 },
      { text: '역 앞 천막에서 승차 등록', done: chain.stage >= 2 },
      { text: '검역을 통과해 열차 타기', done: chain.status === 'done' },
    ];
    const requirements = [
      { text: '상처가 있는 사람 없음', ok: hurt.length === 0, detail: hurt.length ? `상처: ${hurt.map((p) => p.name).join(', ')}` : null },
    ];
    const schedule = chain.stage >= 1 ? `${chain.stage === 1 ? '승차 등록' : '열차 출발'}: ${when(chain)}` : null;
    const next = chain.stage === 1 ? `${when(chain)}에 역에 다녀온다.` : `${when(chain)} 새벽 열차. 그 전에 상처를 모두 치료해 두자.`;
    return { steps, requirements, next, schedule };
  },
};

export const CHAINS = [RESCUE, GROUP, CAR, SAFEZONE, CARAVAN, TRAIN];

export function openerRetriesLeft(chain) {
  return OPENER_RETRIES[chain.id] - chain.retries;
}

/** 첫 사건을 거절해 경로가 아직 열리지 않았지만 다시 찾아올 예정인 상태의 안내 */
export function chainMissedNote(chain) {
  const chances = openerRetriesLeft(chain) + 1; // 이미 예약된 다음 방문 포함
  return chances > 1 ? `놓친 기회. 다시 찾아온다 (남은 기회 ${chances}번)` : '놓친 기회. 한 번 더 찾아오지만, 그때가 마지막이다';
}

