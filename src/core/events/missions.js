// 미션: 탈출 경로와는 별개로 생존을 돕는 곁가지 사건들.
//  - MISSION_EVENTS: 무작위로 일어나는 사건(단발 미션, 또는 여러 날 이어지는 미션의 시작)
//  - MISSIONS: 수락하면 며칠에 걸쳐 이어지는 미션(연쇄 사건). 홈 화면 '미션' 칸에 진행 상황이 나온다.
import { ITEMS, SERVINGS } from '../items.js';

const CAN = SERVINGS;
import { healthLabel } from '../people.js';
import { josa } from '../text.js';
import { allOf, canTransmit, needCapable, needStock } from './helpers.js';

const names = (ids) => (ids.length ? ids.map((id) => ITEMS[id].name).join(', ') : '없음');
const when = (chain) => (chain.status === 'active' ? '오늘' : `${chain.due}일차`);
const hasDog = (game) => (game.flags.dog ? null : '보리가 없다');

// ── 좀비 FM 생존 퀴즈 ────────────────────────────

export const QUIZ = [
  {
    q: '사람이 물 없이 버틸 수 있는 날은 대략 며칠일까요?',
    options: ['사흘', '2주', '한 달'],
    answer: 0,
    why: '물은 식량보다 훨씬 급합니다.',
  },
  {
    q: '뚜껑이 볼록하게 부푼 통조림을 발견했습니다. 어떻게 할까요?',
    options: ['끓여서 먹는다', '버린다', '냄새가 괜찮으면 먹는다'],
    answer: 1,
    why: '부푼 통조림은 끓여도 위험해요.',
  },
  {
    q: '깊이 베인 상처, 가장 먼저 할 일은?',
    options: ['흙을 발라 굳힌다', '물에 오래 담가 둔다', '깨끗한 천으로 꾹 눌러 피를 멈춘다'],
    answer: 2,
    why: '일단 눌러서 피부터 멈춰야죠.',
  },
  {
    q: '빗물을 받아 마시려면 어떻게 해야 할까요?',
    options: ['끓이거나 걸러서 마신다', '소금을 타서 마신다', '받자마자 바로 마신다'],
    answer: 0,
    why: '지붕을 타고 내려온 물은 꼭 끓이세요.',
  },
];

export const quizAnswerId = (params) => 'abc'[QUIZ[params.quiz].answer];

// ── 가위바위보 ──────────────────────────────────

const HANDS = { scissors: '가위', rock: '바위', paper: '보' };
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function playHand(mine) {
  return (ctx) => {
    const theirs = ctx.rng.pick(Object.keys(HANDS));
    const call = `"가위, 바위, 보!" 나는 ${HANDS[mine]}, 사내는 ${HANDS[theirs]}.`;
    if (mine === theirs) return `${call} 비겼다. "쳇, 다음에 또 보자고." 사내는 모자를 고쳐 쓰고 사라졌다.`;
    if (BEATS[mine] === theirs) {
      ctx.give('food', CAN);
      return `${call} 이겼다! 사내는 혀를 차며 통조림 한 캔을 문틈으로 밀어 넣었다. (통조림 +1캔)`;
    }
    ctx.take('food', 2);
    return `${call} 졌다. 사내는 휘파람을 불며 반쯤 남은 통조림을 챙겨 갔다. (통조림 -½캔)`;
  };
}

// ── 무작위로 일어나는 미션 사건 ─────────────────────

export const MISSION_EVENTS = [
  {
    id: 'dog_stray',
    title: '떠돌이 개',
    weight: 3,
    minDay: 2,
    maxCount: 1,
    when: (game) => !game.flags.dog,
    text: () => '깡마른 누렁이 한 마리가 현관 앞에 앉아 꼬리를 흔든다. 낡은 목줄에는 "보리"라고 적혀 있다.',
    options: [
      {
        id: 'adopt',
        label: '식량을 나눠 주고 집에 들인다',
        cost: '통조림 ½캔',
        note: '가끔 밥을 줘야 한다',
        check: needStock('food', 2),
        resolve(ctx) {
          ctx.take('food', 2);
          ctx.game.flags.dog = true;
          ctx.mission('dog').begin([3, 6]);
          return '보리는 통조림을 순식간에 비우더니 현관 앞에 자리를 잡았다. 이제 낯선 기척이 나면 가장 먼저 알아챌 것이다. (통조림 -½캔)';
        },
      },
      { id: 'shoo', label: '쫓아낸다', resolve: () => '보리는 몇 번 뒤돌아보다 골목 끝으로 사라졌다.' },
    ],
  },
  {
    id: 'garden_find',
    title: '싹 난 감자',
    weight: 2.5,
    minDay: 2,
    maxCount: 1,
    text: () => '옥상 창고를 뒤지다 싹이 난 씨감자 한 자루와 빈 스티로폼 상자 몇 개를 찾았다. 옥상에는 볕이 잘 든다.',
    options: [
      {
        id: 'plant',
        label: '옥상에 심는다',
        cost: '물 ½병',
        note: '며칠 뒤 수확할 수 있다',
        check: needStock('water', 2),
        resolve(ctx) {
          ctx.take('water', 2);
          const day = ctx.mission('garden').begin([4, 6]);
          return `스티로폼 상자에 흙을 채우고 감자를 심었다. ${day}일차쯤 싹이 올라올 것이다. (물 -½병)`;
        },
      },
      {
        id: 'eat',
        label: '그냥 삶아 먹는다',
        note: '두 끼 거리',
        resolve(ctx) {
          ctx.give('food', 2);
          return '싹을 도려내고 삶으니 두 끼 거리는 됐다. (통조림 ½캔만큼)';
        },
      },
      { id: 'leave', label: '내버려 둔다', resolve: () => '농사지을 여유는 없다. 자루를 도로 덮어 두었다.' },
    ],
  },
  {
    id: 'dj_quiz',
    title: '좀비 FM',
    weight: 2.5,
    minDay: 3,
    maxCount: 1,
    setup: (game, rng) => ({ quiz: rng.int(0, QUIZ.length - 1) }),
    text: (game, params) =>
      `라디오 다이얼을 돌리다 신나는 트로트에 손이 멈췄다. "여기는 좀비 FM! 살아 있는 청취자를 위한 생존 퀴즈~ 정답자에겐 제 비밀 창고 위치를 알려 드립니다!" 문제: ${QUIZ[params.quiz].q}`,
    hint: '정답을 보내려면 송신 수단(무전기 또는 동생)과 건전지 1개가 필요하다.',
    options: [
      ...['a', 'b', 'c'].map((id, i) => ({
        id,
        label: (game, params) => `"${QUIZ[params.quiz].options[i]}"라고 답한다`,
        cost: '건전지 1',
        check: allOf(needStock('battery'), canTransmit),
        resolve(ctx) {
          ctx.take('battery', 1);
          const quiz = QUIZ[ctx.params.quiz];
          if (i === quiz.answer) {
            const day = ctx.mission('dj').begin([2, 4]);
            return `"딩동댕~ 정답!" DJ가 호들갑을 떨며 비밀 창고 위치를 불러 줬다. ${day}일차에 가 보기로 했다. (건전지 -1)`;
          }
          return `"땡! 아쉽네요~ 정답은 '${quiz.options[quiz.answer]}'! ${quiz.why}" 방송은 다음 곡으로 넘어갔다. (건전지 -1)`;
        },
      })),
      {
        id: 'skip',
        label: '듣기만 한다',
        resolve: () => '퀴즈는 다른 청취자가 맞혔다. 그래도 오랜만에 음악을 들으니 다들 표정이 풀렸다.',
      },
    ],
  },
  {
    id: 'airdrop',
    title: '보급 상자 낙하',
    weight: 2,
    minDay: 3,
    cooldown: 12,
    maxCount: 4,
    text: () =>
      '굉음과 함께 수송기가 지나가더니, 낙하산을 단 주황색 상자가 골목 끝 놀이터에 떨어졌다. 좀비들도 그쪽으로 어슬렁어슬렁 모여든다.',
    options: [
      {
        id: 'flare',
        label: '신호탄을 반대편으로 쏴 좀비를 유인하고 가져온다',
        cost: '신호탄 1',
        note: '안전하고, 상자를 통째로 들고 올 수 있다',
        check: needStock('flare'),
        resolve(ctx) {
          ctx.take('flare', 1);
          const ids = ctx.loot(4);
          return `붉은 불빛을 따라 좀비들이 몰려간 사이, 상자를 통째로 끌고 왔다. 얻은 것: ${names(ids)} (신호탄 -1)`;
        },
      },
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 뛰어가서 가져온다',
        check: needCapable('dad'),
        resolve(ctx) {
          const ids = ctx.loot(3);
          if (ctx.danger(0.25)) {
            ctx.injure(ctx.person('dad'));
            return `아빠가 상자를 뜯어 품에 안고 돌아왔지만, 좀비에게 다리를 긁혔다. 얻은 것: ${names(ids)} (아빠: 부상)`;
          }
          return `아빠가 좀비 사이를 빠져나가 상자 속 물자를 챙겨 왔다. 얻은 것: ${names(ids)}`;
        },
      },
      {
        id: 'me',
        label: '내가 다녀온다',
        note: '다칠 위험이 크다',
        resolve(ctx) {
          const ids = ctx.loot(3);
          if (ctx.danger(0.4)) {
            ctx.injure(ctx.person('me'));
            return `상자를 뜯는 사이 좀비가 덮쳤다. 물자는 챙겼지만 팔을 다쳤다. 얻은 것: ${names(ids)} (나: 부상)`;
          }
          return `숨을 죽이고 놀이터까지 기어가 물자를 챙겨 왔다. 얻은 것: ${names(ids)}`;
        },
      },
      { id: 'skip', label: '포기한다', resolve: () => '상자는 좀비 떼 한가운데 그대로 남았다. 아깝지만 목숨이 먼저다.' },
    ],
  },
  {
    id: 'gambler',
    title: '내기꾼',
    weight: 2,
    minDay: 2,
    cooldown: 8,
    when: (game) => game.stock.food >= 2,
    text: () =>
      '문틈으로 중절모를 쓴 사내가 히죽 웃는다. "심심하지? 가위바위보 한 판 하자고. 통조림 반 캔 걸고, 자네가 이기면 내가 새 걸로 한 캔 주지."',
    options: [
      ...Object.keys(HANDS).map((hand) => ({
        id: hand,
        label: `${HANDS[hand]}를 낸다`,
        cost: '지면 통조림 ½캔',
        check: needStock('food', 2),
        resolve: playHand(hand),
      })),
      { id: 'decline', label: '상대하지 않는다', resolve: () => '"재미없는 친구로군." 사내는 카드 한 벌을 흔들며 사라졌다.' },
    ],
  },
  {
    id: 'vending',
    title: '쓰러진 자판기',
    weight: 2,
    minDay: 2,
    maxCount: 1,
    text: () => '담장 너머 골목에 쓰러진 음료 자판기가 보인다. 유리 안쪽에 캔과 생수병이 그대로 들어 있다.',
    options: [
      {
        id: 'toolkit',
        label: '공구 상자로 조용히 뜯는다',
        check: needStock('toolkit'),
        resolve(ctx) {
          ctx.give('water', 2 * CAN);
          ctx.give('food', CAN);
          return '경첩을 풀어 문을 통째로 떼어 냈다. 소리 하나 없이 깔끔했다. (물 +2병, 통조림 +1캔)';
        },
      },
      {
        id: 'bat',
        label: '방망이로 유리를 깬다',
        note: '소리가 크게 난다',
        check: needStock('weapon'),
        resolve(ctx) {
          ctx.give('water', 2 * CAN);
          ctx.give('food', CAN);
          const present = ctx.present();
          if (present.length && ctx.danger(0.4)) {
            const victim = ctx.rng.pick(present);
            ctx.injure(victim);
            return `유리 깨지는 소리에 좀비가 몰려왔다. 물건은 챙겼지만 ${josa(victim.name, '이/가')} 다쳤다. (물 +2병, 통조림 +1캔, ${victim.name}: ${healthLabel(victim.health).text})`;
          }
          return '와장창! 재빨리 쓸어 담고 돌아왔다. (물 +2병, 통조림 +1캔)';
        },
      },
      {
        id: 'coin',
        label: '주머니 속 동전을 넣어 본다',
        resolve(ctx) {
          if (ctx.rng.chance(0.25)) {
            ctx.give('water', CAN);
            return '덜컹! 놀랍게도 생수 한 병이 굴러 나왔다. 전기가 남아 있었던 모양이다. (물 +1병)';
          }
          return '동전만 삼키고 조용하다. 돈은 이제 아무 쓸모가 없다.';
        },
      },
      { id: 'leave', label: '건드리지 않는다', resolve: () => '괜히 소란을 피울 필요는 없다.' },
    ],
  },
  {
    id: 'mystery_cans',
    title: '상표 없는 통조림',
    weight: 2,
    minDay: 2,
    cooldown: 12,
    maxCount: 4,
    text: () => '다락방 상자에서 상표가 벗겨진 통조림 세 개가 나왔다. 흔들어 보니 묵직하다.',
    options: [
      {
        id: 'open',
        label: '따서 먹어 본다',
        note: '무엇이 들었는지 모른다',
        resolve(ctx) {
          const roll = ctx.rng.next();
          if (roll < 0.4) {
            ctx.give('food', 3 * CAN);
            return '복숭아 통조림이다! 세 캔 모두. 오늘은 잔칫날이다. (통조림 +3캔)';
          }
          if (roll < 0.75 || !ctx.present().length) {
            ctx.give('food', 2 * CAN);
            return `개 사료였다. …의외로 먹을 만하다.${ctx.game.flags.dog ? ' 보리가 제일 좋아했다.' : ''} (통조림 +2캔)`;
          }
          const victim = ctx.rng.pick(ctx.present());
          ctx.injure(victim);
          return `시큼한 냄새가 났지만 이미 늦었다. ${josa(victim.name, '이/가')} 밤새 배를 움켜쥐고 앓았다. (${victim.name}: ${healthLabel(victim.health).text})`;
        },
      },
      {
        id: 'dog',
        tag: '보리',
        label: '보리에게 먼저 냄새를 맡게 한다',
        check: hasDog,
        resolve(ctx) {
          ctx.give('food', 2 * CAN);
          return '보리가 코를 킁킁대더니 하나에는 고개를 홱 돌렸다. 그 캔은 버리고 나머지 둘만 챙겼다. (통조림 +2캔)';
        },
      },
      { id: 'toss', label: '찜찜하니 버린다', resolve: () => '탈이 나는 것보다는 낫다.' },
    ],
  },
  {
    id: 'granny_knock',
    title: '옆집 할머니',
    weight: 2.5,
    minDay: 3,
    maxCount: 1,
    text: () =>
      '옆집과 맞닿은 벽에서 똑, 똑, 똑 소리가 난다. 벽 틈 너머로 옆집 할머니의 가느다란 목소리가 들린다. "젊은이… 약이 다 떨어졌어. 상비약 좀 나눠 줄 수 있겠나?"',
    options: [
      {
        id: 'med',
        label: '구급약을 건넨다',
        cost: '구급약 1',
        check: needStock('med'),
        resolve(ctx) {
          ctx.take('med', 1);
          ctx.mission('granny').begin([3, 5]);
          return '벽 틈으로 약을 밀어 넣었다. "고맙네, 정말 고맙네…" (구급약 -1)';
        },
      },
      {
        id: 'mom',
        who: 'mom',
        label: '엄마가 벽 너머로 증상을 듣고 돌봐 드린다',
        check: needCapable('mom'),
        resolve(ctx) {
          ctx.mission('granny').begin([3, 5]);
          return '엄마가 한참 이야기를 듣더니, 집에 있는 것으로 할 수 있는 처치를 차근차근 일러 드렸다. 할머니의 목소리가 한결 밝아졌다.';
        },
      },
      { id: 'ignore', label: '못 들은 척한다', resolve: () => '두드리는 소리는 한참 이어지다 잦아들었다.' },
    ],
  },
];

// ── 여러 날 이어지는 미션 ──────────────────────────

const DOG = {
  id: 'dog',
  icon: '🐕',
  title: '떠돌이 개 보리',
  trigger: 'manual',
  stages: [
    {
      id: 'dog_dig',
      title: '보리의 발견',
      text: () => '보리가 마당 구석을 정신없이 파헤치며 컹컹 짖는다. 흙 속에서 녹슨 철제 상자 모서리가 보인다.',
      options: [
        {
          id: 'dig',
          label: '함께 파 본다',
          resolve(ctx) {
            const ids = ctx.loot(2);
            ctx.chain.advance([4, 6]);
            return `누군가 묻어 둔 비상 상자가 나왔다! 얻은 것: ${names(ids)}`;
          },
        },
        {
          id: 'stop',
          label: '시끄러우니 말린다',
          resolve(ctx) {
            ctx.chain.advance([4, 6]);
            return '보리는 아쉬운 듯 낑낑대며 물러났다.';
          },
        },
      ],
    },
    {
      id: 'dog_hungry',
      title: '보리의 밥그릇',
      text: () => '보리가 빈 밥그릇을 앞발로 긁으며 올려다본다.',
      options: [
        {
          id: 'feed',
          label: '식량을 나눠 준다',
          cost: '통조림 ¼캔',
          check: needStock('food'),
          resolve(ctx) {
            ctx.take('food', 1);
            ctx.chain.retry([4, 6]);
            return '보리가 꼬리를 흔들며 그릇을 싹 비웠다. (통조림 -¼캔)';
          },
        },
        {
          id: 'none',
          label: '줄 것이 없다',
          note: '보리가 떠난다',
          resolve(ctx) {
            ctx.game.flags.dog = false;
            ctx.chain.fail('굶주린 보리는 집을 떠났다.');
            return '보리는 한참 문 앞에 앉아 있다가, 밤사이 어디론가 떠났다.';
          },
        },
      ],
    },
  ],
  describe(chain) {
    return {
      text: '보리와 함께 지낸다. 습격과 약탈자를 먼저 알아채고, 수상한 음식도 가려낸다.',
      schedule: chain.stage === 0 ? null : `다음 밥 줄 날: ${when(chain)}`,
    };
  },
};

const gardenYield = (chain) => 2 + chain.data.care;

function tendGarden(ctx, care, lead) {
  ctx.chain.data.care += care;
  const day = ctx.chain.advance([5, 8]);
  return `${lead} ${day}일차쯤 캘 수 있겠다.`;
}

const GARDEN = {
  id: 'garden',
  icon: '🥔',
  title: '옥상 감자밭',
  trigger: 'manual',
  initData: () => ({ care: 0, cycles: 0 }),
  stages: [
    {
      id: 'garden_sprout',
      title: '감자 싹',
      text: () => '옥상 감자밭에 싹이 올라왔다. 그런데 까마귀 떼가 난간에 줄지어 앉아 밭을 노려본다.',
      options: [
        {
          id: 'scarecrow',
          who: 'dad',
          label: '아빠가 허수아비를 세운다',
          check: needCapable('dad'),
          resolve: (ctx) => tendGarden(ctx, 2, '아빠가 낡은 옷과 빗자루로 허수아비를 세웠다. 까마귀들이 얼씬도 못 한다.'),
        },
        {
          id: 'water',
          label: '물을 주고 그물을 덮는다',
          cost: '물 ½병',
          check: needStock('water', 2),
          resolve(ctx) {
            ctx.take('water', 2);
            return tendGarden(ctx, 1, '물을 듬뿍 주고 빨래 건조망을 덮어 두었다. (물 -½병)');
          },
        },
        {
          id: 'leave',
          label: '그냥 둔다',
          resolve: (ctx) => tendGarden(ctx, 0, '손쓸 틈이 없었다. 까마귀가 싹을 절반쯤 쪼아 먹었다.'),
        },
      ],
    },
    {
      id: 'garden_harvest',
      title: '감자 수확',
      text: (game, params, chain) => `감자 줄기가 누렇게 시들었다. 캘 때가 됐다. 흙을 헤쳐 보니 ${gardenYield(chain)}알쯤 달렸다.`,
      options: [
        {
          id: 'harvest',
          label: '모두 캔다',
          resolve(ctx) {
            const n = gardenYield(ctx.chain.state);
            ctx.give('food', n);
            ctx.chain.complete(`감자 ${n}알을 수확했다.`);
            return `흙투성이 감자 ${n}알을 캤다. 한 알이 한 끼다. 오랜만에 따뜻한 음식을 먹었다.`;
          },
        },
        {
          id: 'replant',
          label: '작은 감자 하나는 남겨 다시 심는다',
          note: '수확이 하나 줄지만 한 번 더 키울 수 있다',
          check: (game, params, chain) => (chain.data.cycles < 1 ? null : '흙의 힘이 다했다'),
          resolve(ctx) {
            const data = ctx.chain.data;
            const n = gardenYield(ctx.chain.state) - 1;
            ctx.give('food', n);
            data.cycles += 1;
            data.care = 0;
            const day = ctx.chain.goto(0, [4, 6]);
            return `감자 ${n}알을 캐고, 가장 작은 것은 다시 심었다. ${day}일차쯤 싹이 올라올 것이다.`;
          },
        },
      ],
    },
  ],
  describe(chain) {
    if (chain.stage === 0) return { text: '감자를 심었다. 싹이 트기를 기다리는 중.', schedule: `싹 확인: ${when(chain)}` };
    return { text: `감자가 자라는 중. 예상 수확 ${gardenYield(chain)}알.`, schedule: `수확: ${when(chain)}` };
  },
};

function raidCache(ctx, who, risk) {
  const ids = ctx.loot(3);
  const p = ctx.person(who);
  ctx.chain.complete(`노래방 금고에서 물자를 꺼내 왔다: ${names(ids)}`);
  if (ctx.danger(risk)) {
    ctx.injure(p);
    return `금고는 정말 있었다. 다만 복도에서 좀비와 마주쳐 ${josa(p.name, '이/가')} 다쳤다. 얻은 것: ${names(ids)} (${p.name}: ${healthLabel(p.health).text})`;
  }
  return `금고는 정말 있었다. 주파수 숫자를 누르자 철컥 열렸다. 얻은 것: ${names(ids)}`;
}

const DJ = {
  id: 'dj',
  icon: '📻',
  title: '좀비 FM의 비밀 창고',
  trigger: 'manual',
  stages: [
    {
      id: 'dj_cache',
      title: '노래방 금고',
      text: () =>
        'DJ가 알려 준 곳은 두 블록 떨어진 폐업한 노래방. 계산대 밑 금고에 물자를 숨겨 뒀다고 했다. 비밀번호는 "좀비 FM 주파수".',
      options: [
        { id: 'dad', who: 'dad', label: '아빠가 다녀온다', check: needCapable('dad'), resolve: (ctx) => raidCache(ctx, 'dad', 0.15) },
        { id: 'me', label: '내가 다녀온다', note: '다칠 위험이 있다', resolve: (ctx) => raidCache(ctx, 'me', 0.35) },
        {
          id: 'skip',
          label: '너무 위험하다, 가지 않는다',
          resolve(ctx) {
            ctx.chain.complete('창고에는 가지 않았다.');
            return '함정일지도 모른다. 금고는 열어 보지 않기로 했다.';
          },
        },
      ],
    },
  ],
  describe: (chain) => ({ text: '퀴즈를 맞혀 DJ의 비밀 창고 위치를 알아냈다.', schedule: `가 볼 날: ${when(chain)}` }),
};

function grannyGift(ctx) {
  const gift = ctx.game.stock.map < 1 ? 'roadmap' : 'flare';
  ctx.game.addItems([gift]);
  return ITEMS[gift].name;
}

const GRANNY = {
  id: 'granny',
  icon: '👵',
  title: '옆집 할머니',
  trigger: 'manual',
  stages: [
    {
      id: 'granny_gift',
      title: '할머니의 보따리',
      text: () =>
        '벽 틈으로 보따리 하나가 밀려 들어왔다. 통조림 두 개와, 낡은 종이 뭉치가 들어 있다. "덕분에 살았어. 영감이 쓰던 건데, 나보다 자네들한테 쓸모 있을 거야."',
      options: [
        {
          id: 'accept',
          label: '고맙게 받는다',
          resolve(ctx) {
            ctx.give('food', 2 * CAN);
            const gift = grannyGift(ctx);
            ctx.chain.complete(`할머니에게 통조림과 ${gift}를 받았다.`);
            return `보따리를 풀었다. (통조림 +2캔, ${gift} +1)`;
          },
        },
        {
          id: 'share',
          label: '통조림 하나는 도로 밀어 드린다',
          note: '통조림 1캔만 받는다',
          resolve(ctx) {
            ctx.give('food', CAN);
            const gift = grannyGift(ctx);
            ctx.game.flags.shortcut = true;
            ctx.chain.complete(`할머니가 좀비가 드문 뒷골목을 알려 주었다. 탐사가 조금 더 안전해졌다.`);
            return `"할머니도 드셔야죠." 한참 말이 없던 할머니가, 동네 뒷골목 중 좀비가 드문 길을 하나하나 짚어 주었다. 앞으로 탐사가 조금 더 안전해진다. (통조림 +1캔, ${gift} +1)`;
          },
        },
      ],
    },
  ],
  describe: () => ({ text: '옆집 할머니를 도와드렸다. 소식을 기다리는 중.', schedule: null }),
};

export const MISSIONS = [DOG, GARDEN, DJ, GRANNY];

export { hasDog };
