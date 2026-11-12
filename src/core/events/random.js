// 무작위 사건. when(game) 이 참인 사건 중에서 가중치(weight)로 뽑힌다.
import { SERVINGS, formatAmount, formatResources } from '../items.js';
import { healthLabel } from '../people.js';
import { josa } from '../text.js';
import { HUNGER_NOTICE } from '../constants.js';
import { allOf, needCapable, needStock } from './helpers.js';

const hasDog = (game) => (game.flags.dog ? null : '보리가 없다');

const CAN = SERVINGS; // 통조림 1캔·물 1병 = 4번
const TRADES = [
  { give: { food: CAN }, get: { water: 2 * CAN } },
  { give: { water: CAN }, get: { food: 2 * CAN } },
  { give: { food: 2 * CAN }, get: { med: 1 } },
  { give: { water: 2 * CAN }, get: { battery: 1 } },
  { give: { food: 2 * CAN }, get: { flare: 1 } },
  { give: { med: 1 }, get: { fuel: 1 } },
  { give: { food: CAN, water: CAN }, get: { map: 1 } },
  { give: { battery: 1 }, get: { food: 2 * CAN } },
  { give: { weapon: 1 }, get: { water: 3 * CAN } },
];

/** take 결과를 '(통조림 -½캔)'처럼 */
const minus = (key, n) => `${formatAmount(key, n).replace(/ /, ' -')}`;

const pname = (game, id) => game.person(id).name;

export const RANDOM_EVENTS = [
  {
    id: 'raid',
    title: '좀비 습격',
    weight: 3,
    minDay: 2,
    cooldown: 4,
    text: () => '한밤중, 좀비 떼가 현관문과 창문을 두드린다. 문틀이 삐걱거리며 흔들린다!',
    options: [
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 문을 막아선다',
        check: needCapable('dad'),
        resolve(ctx) {
          if (ctx.danger(0.35)) {
            ctx.injure(ctx.person('dad'));
            return '아빠가 온몸으로 문을 버텨 좀비를 막아냈다. 하지만 팔을 물어뜯겨 다쳤다. (아빠: 부상)';
          }
          return '아빠가 문을 단단히 막아섰다. 좀비들은 새벽녘 흩어졌다.';
        },
      },
      {
        id: 'bat',
        label: '야구 방망이로 맞선다',
        check: needStock('weapon'),
        resolve(ctx) {
          const lines = [];
          if (ctx.danger(0.3)) {
            ctx.injure(ctx.person('me'));
            lines.push('좀비를 쫓아냈지만 손을 물렸다. (나: 부상)');
          } else {
            lines.push('창문 틈으로 방망이를 휘둘러 좀비를 쫓아냈다.');
          }
          if (ctx.rng.chance(0.25)) {
            ctx.take('weapon', 1);
            lines.push('방망이가 부러졌다.');
          }
          return lines.join(' ');
        },
      },
      {
        id: 'dog',
        tag: '보리',
        label: '보리가 먼저 알아채고 으르렁거린다',
        check: hasDog,
        resolve(ctx) {
          if (!ctx.danger(0.2)) {
            return '보리가 미리 낌새를 채고 으르렁거린 덕에, 불을 끄고 가구로 문을 막을 시간이 있었다. 좀비들은 그냥 지나갔다.';
          }
          const food = ctx.take('food', 2);
          return `보리가 짖는 소리에 좀비가 더 몰려들었다. 겨우 버텼지만 부엌 창이 깨져 식량이 엉망이 됐다. (${minus('food', food)})`;
        },
      },
      {
        id: 'hide',
        label: '불을 끄고 숨죽인다',
        resolve(ctx) {
          const present = ctx.present();
          if (!present.length || !ctx.danger(0.5)) return '숨소리조차 죽인 채 버텼다. 좀비들은 지나갔다.';
          const victim = ctx.rng.pick(present);
          ctx.injure(victim);
          const food = ctx.take('food', 2);
          const water = ctx.take('water', 2);
          return `창문이 깨지고 좀비 한 마리가 들어왔다. 겨우 몰아냈지만 ${josa(victim.name, '이/가')} 다쳤고 물자가 엉망이 됐다. (${victim.name}: 부상, ${minus('food', food)}, ${minus('water', water)})`;
        },
      },
    ],
  },
  {
    id: 'looters',
    title: '약탈자',
    weight: 2,
    minDay: 3,
    cooldown: 3,
    text: () => '무장한 남자 둘이 현관 앞에서 소리친다. "먹을 거 내놔. 안 그러면 문을 부순다!"',
    options: [
      {
        id: 'give',
        label: '식량과 물을 조금 내준다',
        cost: '통조림 1캔 · 물 1병',
        resolve(ctx) {
          const food = ctx.take('food', CAN);
          const water = ctx.take('water', CAN);
          return `물자를 문틈으로 내밀었다. 약탈자들은 비웃으며 사라졌다. (${minus('food', food)}, ${minus('water', water)})`;
        },
      },
      {
        id: 'bat',
        label: '방망이를 들고 맞선다',
        check: needStock('weapon'),
        resolve(ctx) {
          if (!ctx.danger(0.4)) return '방망이를 쥐고 버티자 약탈자들이 욕설을 내뱉으며 물러났다.';
          ctx.injure(ctx.person('me'));
          const food = ctx.take('food', 2);
          return `몸싸움 끝에 쫓아냈지만 다쳤고 식량을 빼앗겼다. (나: 부상, ${minus('food', food)})`;
        },
      },
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 나가서 상대한다',
        check: needCapable('dad'),
        resolve(ctx) {
          if (ctx.danger(0.3)) {
            ctx.injure(ctx.person('dad'));
            return '아빠가 약탈자들을 제압해 쫓아냈다. 그 과정에서 아빠가 다쳤다. (아빠: 부상)';
          }
          return '전직 경비원인 아빠가 문 앞을 가로막자 약탈자들은 슬금슬금 물러났다.';
        },
      },
      {
        id: 'dog',
        tag: '보리',
        label: '보리를 앞세운다',
        check: hasDog,
        resolve(ctx) {
          if (!ctx.danger(0.25)) return '보리가 이를 드러내고 달려들자 약탈자들은 혼비백산 달아났다.';
          const food = ctx.take('food', 2);
          return `약탈자가 던진 고깃덩이에 보리가 한눈을 판 사이, 식량을 조금 빼앗겼다. (${minus('food', food)})`;
        },
      },
    ],
  },
  {
    id: 'injury_worse',
    title: '부상 악화',
    weight: 4,
    minDay: 2,
    cooldown: 2,
    when: (game) => game.presentPeople().some((p) => p.health >= 1),
    setup(game, rng) {
      const injured = game.presentPeople().filter((p) => p.health >= 1);
      const worst = Math.max(...injured.map((p) => p.health));
      return { target: rng.pick(injured.filter((p) => p.health === worst)).id };
    },
    text: (game, params) => `${pname(game, params.target)}의 상처가 붉게 부어오르고 열이 오른다. 이대로 두면 위험하다.`,
    options: [
      {
        id: 'med',
        label: '구급약을 쓴다',
        cost: '구급약 1',
        check: needStock('med'),
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.take('med', 1);
          ctx.heal(p, 1);
          return `${p.name}에게 구급약을 썼다. 열이 내리기 시작했다. (${p.name}: ${healthLabel(p.health).text})`;
        },
      },
      {
        id: 'mom',
        who: 'mom',
        label: '엄마가 응급처치한다',
        check: allOf(needCapable('mom'), (game, params) => (params.target === 'mom' ? '엄마 자신이 환자다' : null)),
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          p.treatedToday = true;
          p.untreated = 0;
          return `엄마가 상처를 소독하고 붕대를 갈았다. ${p.name}의 상태가 더 나빠지지는 않았다.`;
        },
      },
      {
        id: 'wait',
        label: '그냥 버티게 한다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.injure(p);
          return `약도 없이 밤을 새웠다. ${p.name}의 상태가 악화됐다. (${p.name}: ${healthLabel(p.health).text})`;
        },
      },
    ],
  },
  {
    id: 'rain',
    title: '폭우',
    weight: 2.5,
    minDay: 2,
    cooldown: 5,
    text: () => '밤새 장대비가 쏟아진다. 빗물을 모을 수 있을지도 모른다.',
    options: [
      {
        id: 'outside',
        label: '마당에 양동이를 내놓는다',
        note: '물 1½병 · 밖에 나가야 해서 위험하다',
        resolve(ctx) {
          ctx.give('water', 6);
          if (ctx.danger(0.25)) {
            ctx.injure(ctx.person('me'));
            return '빗물을 모았지만 돌아오는 길에 좀비에게 할퀴었다. (물 +1½병, 나: 부상)';
          }
          return '빗소리에 발소리를 숨겨 양동이를 내놓았다. (물 +1½병)';
        },
      },
      {
        id: 'window',
        label: '창문 틈으로만 받는다',
        note: '물 ½병',
        resolve(ctx) {
          ctx.give('water', 2);
          return '창문 틈으로 냄비를 내밀어 빗물을 조금 받았다. (물 +½병)';
        },
      },
    ],
  },
  {
    id: 'trade',
    title: '떠돌이 생존자의 거래',
    weight: 2.5,
    minDay: 2,
    cooldown: 5,
    setup: (game, rng) => ({ offer: rng.int(0, TRADES.length - 1) }),
    text(game, params) {
      const t = TRADES[params.offer];
      return `배낭을 멘 떠돌이 생존자가 문틈으로 말을 건다. "거래하자. 네가 줄 것: ${formatResources(t.give)} / 내가 줄 것: ${formatResources(t.get)}."`;
    },
    options: [
      {
        id: 'accept',
        label: '거래한다',
        cost: (game, params) => formatResources(TRADES[params.offer].give),
        check(game, params) {
          for (const [key, n] of Object.entries(TRADES[params.offer].give)) {
            if (game.stock[key] < n) return `${formatAmount(key, n)} 필요 (남은 것 ${formatAmount(key, game.stock[key])})`;
          }
          return null;
        },
        resolve(ctx) {
          const t = TRADES[ctx.params.offer];
          for (const [key, n] of Object.entries(t.give)) ctx.take(key, n);
          for (const [key, n] of Object.entries(t.get)) ctx.give(key, n);
          return `거래가 성사됐다. (내줌: ${formatResources(t.give)} / 받음: ${formatResources(t.get)})`;
        },
      },
      {
        id: 'decline',
        label: '거절한다',
        resolve: () => '"후회할 거다." 생존자는 어둠 속으로 사라졌다.',
      },
    ],
  },
  {
    id: 'spoiled',
    title: '쥐 떼',
    weight: 1,
    minDay: 3,
    cooldown: 4,
    when: (game) => game.stock.food >= CAN,
    text: () => '창고에서 바스락 소리가 난다. 쥐 떼가 식량을 갉아먹고 있다!',
    options: [
      {
        id: 'discard',
        label: '갉아먹힌 식량을 버린다',
        cost: '통조림 1캔',
        resolve(ctx) {
          const food = ctx.take('food', CAN);
          return `쥐가 손댄 식량을 아깝지만 버렸다. (${minus('food', food)})`;
        },
      },
      {
        id: 'keep',
        label: '아까우니 그냥 둔다',
        note: '누군가 탈이 날 수 있다',
        resolve(ctx) {
          const present = ctx.present();
          if (present.length && ctx.danger(0.5)) {
            const victim = ctx.rng.pick(present);
            ctx.injure(victim);
            return `${josa(victim.name, '이/가')} 상한 음식을 먹고 심한 배탈로 앓아누웠다. (${victim.name}: ${healthLabel(victim.health).text})`;
          }
          return '다행히 아무도 탈이 나지 않았다.';
        },
      },
    ],
  },
  {
    id: 'lost_child',
    title: '길 잃은 아이',
    weight: 1,
    minDay: 2,
    maxCount: 1,
    text: () => '어린아이가 문 앞에서 훌쩍이며 물 한 모금만 달라고 한다.',
    options: [
      {
        id: 'give',
        label: '물을 나눠 준다',
        cost: '물 ¼병',
        check: needStock('water'),
        resolve(ctx) {
          ctx.take('water', 1);
          ctx.give('battery', 1);
          return '아이는 물을 단숨에 마시더니, 고맙다며 주머니에서 건전지 하나를 꺼내 주고 사라졌다. (물 -¼병, 건전지 +1)';
        },
      },
      {
        id: 'refuse',
        label: '문을 열지 않는다',
        resolve: () => '울음소리가 한참 이어지다 멀어졌다.',
      },
    ],
  },
  {
    id: 'family_return',
    title: '돌아온 가족',
    weight: 5,
    minDay: 3,
    cooldown: 1,
    when: (game) => game.people.some((p) => p.status === 'left'),
    setup: (game, rng) => ({ member: rng.pick(game.people.filter((p) => p.status === 'left')).id }),
    text: (game, params) =>
      `누군가 문을 다급하게 두드린다. 그날 두고 왔던 ${josa(pname(game, params.member), '이/가')} 혼자 살아남아 찾아왔다! 지치고 굶주려 보인다.`,
    options: [
      {
        id: 'accept',
        label: '문을 열고 들인다',
        note: '식구가 늘어 식량과 물이 더 든다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.member);
          p.status = 'home';
          p.hunger = 3;
          p.thirst = 2;
          return `${josa(p.name, '을/를')} 집에 들였다. 이제 ${ctx.present().length}명이 함께 지낸다.`;
        },
      },
      {
        id: 'refuse',
        label: '문을 열지 않는다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.member);
          p.status = 'lost';
          return `${p.name}의 발소리가 멀어졌다. 다시는 볼 수 없을 것이다.`;
        },
      },
    ],
  },
  {
    id: 'quarrel',
    title: '몰래 먹은 식량',
    weight: 2,
    minDay: 3,
    cooldown: 3,
    when: (game) => game.stock.food >= 1 && game.presentPeople().some((p) => !p.isPlayer && p.hunger >= HUNGER_NOTICE),
    setup(game) {
      const hungry = game.presentPeople().filter((p) => !p.isPlayer && p.hunger >= HUNGER_NOTICE);
      hungry.sort((a, b) => b.hunger - a.hunger);
      return { member: hungry[0].id };
    },
    text: (game, params) =>
      `밤중에 ${josa(pname(game, params.member), '이/가')} 창고에서 몰래 식량을 꺼내 먹으려다 들켰다. 눈이 퀭하다.`,
    options: [
      {
        id: 'allow',
        label: '나눠 먹게 둔다',
        cost: '통조림 ¼캔',
        check: needStock('food'),
        resolve(ctx) {
          const p = ctx.person(ctx.params.member);
          ctx.take('food', 1);
          p.hunger = 0;
          return `${p.name}에게 식량을 나눠 주었다. (통조림 -¼캔, ${p.name}: 배부름)`;
        },
      },
      {
        id: 'stop',
        label: '단호하게 막는다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.member);
          return `${josa(p.name, '은/는')} 고개를 떨군 채 구석으로 돌아갔다. 집 안 공기가 무겁다.`;
        },
      },
    ],
  },
];
