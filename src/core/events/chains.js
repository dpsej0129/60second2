// 승리 경로가 되는 연쇄 사건. 각 단계는 앞 단계가 끝난 뒤에야 무작위 날짜로 예약된다.
// 모든 단계에는 항상 고를 수 있는 선택지가 있고, 그 선택지는 반드시 다음 일정(재시도·진행·종료)을 정한다.
import { isCapable } from '../people.js';
import { allOf, canTransmit, criticalPeople, needCapable, needStock } from './helpers.js';

const OPENER_RETRIES = { rescue: 2, group: 1, car: 1 };

const when = (chain) => (chain.status === 'active' ? '오늘' : `${chain.due}일차`);

// ── 군 구조 헬기 ─────────────────────────────────

function respondToRescue(ctx, via) {
  ctx.take('battery', 1);
  ctx.chain.open();
  ctx.chain.data.via = via;
  const day = ctx.chain.advance([2, 3]);
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
  openWindow: [2, 5],
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
      hint: '응답하려면 무전기(또는 라디오를 개조할 동생)와 건전지가 필요하다.',
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
              ctx.chain.retry([2, 4]);
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
      hint: '위치를 보고하려면 건전지 1개와 송신 수단(무전기 또는 동생)이 필요하다.',
      options: [
        {
          id: 'report',
          label: '위치를 보고한다',
          cost: '건전지 1',
          check: allOf(needStock('battery'), canTransmit),
          resolve(ctx) {
            ctx.take('battery', 1);
            const day = ctx.chain.advance([2, 3]);
            ctx.chain.data.arrivalDay = day;
            return `"확인했다. ${day}일차에 헬기가 옥상에 도착한다. 신호탄으로 위치를 알려라. 걷지 못하는 사람은 태울 수 없다." (건전지 -1)`;
          },
        },
        {
          id: 'later',
          label: '지금은 교신할 수 없다',
          note: '구조대가 하루 이틀 뒤 다시 연락한다',
          resolve(ctx) {
            const day = ctx.chain.retry([1, 2]);
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
      hint: '신호탄이 있어야 하고, 걷지 못하는 중상자는 태울 수 없다.',
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
            return '붉은 신호탄이 하늘을 갈랐다. 헬기가 옥상에 내려앉고, 모두가 줄사다리를 올랐다.';
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
            for (const p of left) p.status = 'lost';
            ctx.chain.complete();
            ctx.win('rescue', { leftBehind: left.map((p) => p.name) });
            return `신호탄을 쏘아 올렸다. ${left.map((p) => p.name).join(', ')}의 손을 놓고 줄사다리를 올랐다.`;
          },
        },
        {
          id: 'pass',
          label: '이번에는 헬기를 보낸다',
          note: (game, params, chain) => (chain.data.missed ? '구조 경로가 닫힌다' : '구조대가 한 번 더 온다'),
          resolve(ctx) {
            const data = ctx.chain.data;
            if (data.missed < 1) {
              data.missed += 1;
              const day = ctx.chain.retry([2, 2]);
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
    if (chain.stage === 1) {
      schedule = `다음 교신: ${when(chain)}`;
      next = `${when(chain)}에 구조대가 다시 교신한다. 건전지 1개를 남겨 두고, 헬기가 오기 전에 마트에서 신호탄을 구해 두자.`;
    } else if (chain.stage === 2) {
      schedule = `헬기 도착: ${when(chain)}`;
      next = `${when(chain)}에 헬기가 온다. 신호탄 1발을 재고에 두고, 중상자는 구급약으로 치료해 두자.${d.missed ? ' 이번이 마지막 기회다.' : ''}`;
    }
    return { steps, requirements, next, schedule };
  },
};

// ── 강변 거점 합류 ───────────────────────────────

function openGroup(ctx, food, water, lead) {
  ctx.chain.open();
  Object.assign(ctx.chain.data, { food, water });
  const day = ctx.chain.advance([2, 4]);
  return `${lead} "우리 거점은 담장도 있고 경비도 선다. 대신 빈손으로는 받아 줄 수 없다. 합류하는 날 식량 ${food}, 물 ${water}. 그게 조건이다. ${day}일차에 다시 들르겠다."`;
}

function finishTrustTest(ctx, lead) {
  const d = ctx.chain.data;
  const day = ctx.chain.advance([2, 3]);
  d.joinDay = day;
  return `${lead} "${day}일차에 데리러 오겠다. 식량 ${d.food}, 물 ${d.water}. 잊지 마라."`;
}

const GROUP = {
  id: 'group',
  icon: '🏚️',
  title: '강변 거점 합류',
  openWindow: [3, 6],
  initData: () => ({ food: 4, water: 4, trust: null, joinDay: null, delays: 0 }),
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
          note: '합류 조건: 식량 4 · 물 4',
          resolve: (ctx) => openGroup(ctx, 4, 4, '상대는 총구를 내리고 조건을 말했다.'),
        },
        {
          id: 'dad',
          who: 'dad',
          label: '아빠가 문 앞에서 경계하며 교섭한다',
          note: '더 나은 조건: 식량 3 · 물 3',
          check: needCapable('dad'),
          resolve: (ctx) => openGroup(ctx, 3, 3, '아빠의 단호한 태도에 상대가 한발 물러섰다.'),
        },
        {
          id: 'refuse',
          label: '문을 열지 않는다',
          note: (game, params, chain) =>
            chain.retries < OPENER_RETRIES.group ? '한 번 더 찾아올지도 모른다' : '다시는 오지 않을 것이다',
          resolve(ctx) {
            if (ctx.chain.state.retries < OPENER_RETRIES.group) {
              ctx.chain.retry([3, 5]);
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
          note: '합류 조건이 식량 +2 · 물 +2 늘어난다',
          resolve(ctx) {
            const d = ctx.chain.data;
            d.food += 2;
            d.water += 2;
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
        `약속한 날, 거점 사람들이 트럭을 몰고 왔다. "약속한 물자는 준비됐나? 식량 ${chain.data.food}, 물 ${chain.data.water}."${chain.data.delays ? ' 이번이 마지막 기회다.' : ''}`,
      options: [
        {
          id: 'pay',
          label: '약속한 물자를 건네고 합류한다',
          cost: (game, params, chain) => `식량 ${chain.data.food} · 물 ${chain.data.water}`,
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
          note: (game, params, chain) => (chain.data.delays ? '합류 경로가 닫힌다' : '이틀 더 기다려 준다'),
          resolve(ctx) {
            const d = ctx.chain.data;
            if (d.delays < 1) {
              d.delays += 1;
              const day = ctx.chain.retry([2, 2]);
              d.joinDay = day;
              return `"이틀 주겠다. ${day}일차에도 없으면 없던 일이다."`;
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
    if (chain.stage === 1) {
      schedule = `거점 사람 방문: ${when(chain)}`;
      next = `${when(chain)}에 거점 사람들이 다시 온다. 합류 날 낼 몫(식량 ${d.food}, 물 ${d.water})을 따로 모아 두자. 가족이 먹을 몫은 별도로 필요하다.`;
    } else if (chain.stage === 2) {
      schedule = `합류의 날: ${when(chain)}`;
      next = `${when(chain)}에 데리러 온다. 그날 아침 재고에 식량 ${d.food} 이상, 물 ${d.water} 이상이 남아 있어야 한다. 전날 밤 배급을 줄여서라도 남겨 두자.${d.delays ? ' 이번이 마지막 기회다.' : ''}`;
    }
    return { steps, requirements, next, schedule };
  },
};

// ── 승합차 탈출 ──────────────────────────────────

function repaired(ctx, lead) {
  ctx.chain.data.repaired = true;
  const day = ctx.chain.advance([1, 3]);
  ctx.chain.data.departDay = day;
  return `${lead} 이제 연료통 2개와 도로 지도만 있으면 된다. ${day}일차에 출발 준비를 점검하자.`;
}

const CAR = {
  id: 'car',
  icon: '🚐',
  title: '승합차 탈출',
  openWindow: [4, 8],
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
            const day = ctx.chain.advance([1, 3]);
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
              ctx.chain.retry([3, 5]);
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
      hint: '공구 상자가 있거나, 동생이 움직일 수 있어야 고칠 수 있다.',
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
          note: '하루 이틀 뒤 다시 시도한다',
          resolve(ctx) {
            const day = ctx.chain.retry([1, 2]);
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
          note: '2~3일 뒤 다시 점검한다',
          resolve(ctx) {
            const day = ctx.chain.retry([2, 3]);
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
    if (chain.stage === 1) {
      schedule = `엔진 수리: ${when(chain)}`;
      next = `${when(chain)}에 엔진을 손본다. 마트에서 공구 상자(2칸)를 가져오거나 동생이 움직일 수 있어야 한다.`;
    } else if (chain.stage === 2) {
      schedule = `출발 점검: ${when(chain)}`;
      next = `${when(chain)}에 출발 여부를 점검한다. 연료통 2개(각 2칸)와 도로 지도(1칸)를 재고에 모아 두자.`;
    }
    return { steps, requirements, next, schedule };
  },
};

export const CHAINS = [RESCUE, GROUP, CAR];

export function openerRetriesLeft(chain) {
  return OPENER_RETRIES[chain.id] - chain.retries;
}

export function chainMissedNote(chain) {
  const left = openerRetriesLeft(chain);
  return left > 0 ? `놓친 기회. 다시 찾아올 수 있다 (남은 기회 ${left}번)` : '마지막 기회를 놓쳤다';
}

