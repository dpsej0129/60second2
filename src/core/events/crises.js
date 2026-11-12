// 집을 잃을 수도 있는 위기: 불, 좀비 떼. 미리 대비하면 무사히 넘길 수 있다.
import { SERVINGS } from '../items.js';
import { josa } from '../text.js';
import { needCapable, needStock } from './helpers.js';

const CAN = SERVINGS;

function hordePassed(game) {
  game.flags.hordeDay = null;
  game.flags.barricade = false;
}

function hordeWarned(ctx, lead, barricade) {
  const day = ctx.day + ctx.rng.int(2, 4);
  ctx.game.flags.hordeDay = day;
  ctx.game.flags.barricade = barricade;
  return `${lead} ${day}일차쯤 이 앞을 지나갈 것 같다.`;
}

export const CRISIS_EVENTS = [
  {
    id: 'fire',
    title: '불길',
    weight: 0.9,
    minDay: 25,
    cooldown: 30,
    maxCount: 2,
    when: (game) => game.flags.shelter !== 'bunker', // 콘크리트 방공호는 불이 번지지 않는다
    text: () => '한밤중, 매캐한 냄새에 눈을 떴다. 촛불이 커튼에 옮겨붙어 거실에 연기가 차오른다!',
    options: [
      {
        id: 'water',
        label: '물을 끼얹는다',
        cost: '물 2병',
        check: needStock('water', 2 * CAN),
        resolve(ctx) {
          ctx.take('water', 2 * CAN);
          return '물병을 들이붓고 또 들이부었다. 불길은 잡혔지만 커튼과 소파 한쪽이 새까맣게 탔다. (물 -2병)';
        },
      },
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 담요로 덮어 끈다',
        check: needCapable('dad'),
        resolve(ctx) {
          const dad = ctx.person('dad');
          const hurt = ctx.danger(0.4);
          if (hurt) ctx.injure(dad);
          return `${josa(dad.name, '이/가')} 담요를 뒤집어쓰고 불길을 덮쳤다. 불은 꺼졌다.${hurt ? ` ${josa(dad.name, '은/는')} 팔에 화상을 입었다.` : ''}`;
        },
      },
      {
        id: 'me',
        label: '젖은 담요로 직접 덮친다',
        note: '불길을 못 잡으면 집을 잃는다',
        resolve(ctx) {
          if (ctx.danger(0.2)) {
            ctx.end('fire');
            return '담요가 불길을 막지 못했다. 불은 순식간에 천장으로 번졌다.';
          }
          const hurt = ctx.danger(0.5);
          if (hurt) ctx.injure(ctx.game.me);
          return `정신없이 담요를 휘둘렀다. 불은 꺼졌다.${hurt ? ' 손바닥이 물집투성이가 됐다.' : ''}`;
        },
      },
      {
        id: 'flee',
        label: '식구들을 데리고 밖으로 뛰쳐나간다',
        note: '집을 버린다',
        resolve(ctx) {
          ctx.end('fire');
          return '연기를 헤치고 문밖으로 굴러 나왔다. 돌아보니 창문마다 불길이 넘실거렸다.';
        },
      },
    ],
  },
  {
    id: 'horde_warning',
    title: '다가오는 좀비 떼',
    weight: 1,
    minDay: 28,
    cooldown: 25,
    maxCount: 2,
    when: (game) => game.flags.hordeDay == null,
    text: (game) =>
      game.stock.radio > 0
        ? '무전기 잡음 사이로 다급한 목소리가 들린다. "북쪽에서 거대한 좀비 떼가 남하 중. 며칠 안에 이 구역을 지납니다. 문을 막고 숨으세요."'
        : '바람을 타고 먼 곳에서 수백 개의 신음이 한꺼번에 들려온다. 무언가 거대한 것이 이쪽으로 오고 있다.',
    options: [
      {
        id: 'toolkit',
        label: '공구 상자로 문과 창문에 판자를 덧댄다',
        check: needStock('toolkit'),
        resolve: (ctx) => hordeWarned(ctx, '하루 종일 못질을 했다. 창문마다 판자가 두 겹이 됐다.', true),
      },
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 가구를 옮겨 문을 막는다',
        check: needCapable('dad'),
        resolve: (ctx) => hordeWarned(ctx, '아빠가 장롱과 냉장고를 끌어다 현관을 막았다.', true),
      },
      {
        id: 'pray',
        label: '그냥 지나가기만을 빈다',
        resolve: (ctx) => hordeWarned(ctx, '할 수 있는 게 없다. 불을 끄고 숨죽이기로 했다.', false),
      },
    ],
  },
  {
    id: 'horde',
    title: '좀비 떼',
    weight: 60,
    minDay: 28,
    when: (game) => game.flags.hordeDay != null && game.day >= game.flags.hordeDay,
    text: (game) =>
      game.flags.shelter === 'bunker'
        ? '새벽, 땅이 울린다. 좀비 떼가 방공호 위 공원을 지나간다. 철문 너머로 발소리가 끝없이 이어진다.'
        : game.flags.barricade
        ? '새벽, 땅이 울린다. 거리가 좀비로 가득 찼다. 덧대 둔 판자가 삐걱거린다.'
        : '새벽, 땅이 울린다. 거리가 좀비로 가득 찼다. 아무것도 막지 않은 문이 덜컹거린다.',
    options: [
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 온몸으로 문을 받친다',
        check: needCapable('dad'),
        resolve(ctx) {
          const dad = ctx.person('dad');
          const hurt = ctx.danger(ctx.game.flags.barricade ? 0.15 : 0.5);
          if (hurt) ctx.injure(dad);
          hordePassed(ctx.game);
          return `${josa(dad.name, '이/가')} 하루 종일 문에 등을 대고 버텼다. 해 질 녘 좀비 떼는 남쪽으로 흘러갔다.${hurt ? ` ${josa(dad.name, '은/는')} 어깨를 다쳤다.` : ''}`;
        },
      },
      {
        id: 'hold',
        label: '불을 끄고 숨죽인 채 버틴다',
        note: (game) =>
          game.flags.shelter === 'bunker' ? '두꺼운 철문이 있다' : game.flags.barricade ? '판자를 덧대 두었다' : '아무것도 막아 두지 않았다',
        resolve(ctx) {
          const barricade = ctx.game.flags.barricade || ctx.game.flags.shelter === 'bunker';
          hordePassed(ctx.game);
          if (barricade) return '판자가 버텼다. 해 질 녘, 좀비 떼는 남쪽으로 흘러갔다.';
          if (ctx.danger(0.3)) {
            ctx.end('horde');
            return '새벽녘, 문짝이 경첩째 뜯겨 나갔다.';
          }
          ctx.take('food', CAN);
          return '창문 하나가 깨져 좀비 몇이 들어왔다. 겨우 몰아냈지만 선반이 엉망이 됐다. (통조림 -1캔)';
        },
      },
    ],
  },
];
