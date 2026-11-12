// 문 앞에 찾아오는 사람들: 다른 결말로 이어질 수 있는 사건.
// - 하얀 옷의 사람들: 세 번째로 찾아오면 따라갈 수 있다(기묘한 결말 '하얀 정원').
// - 약탈자 무리: 쪽지를 두 번 무시하면 쳐들어온다. 맞서거나 내주거나, 집을 버리고 달아날 수 있다(결말 '빼앗긴 집').
import { SERVINGS } from '../items.js';
import { isCapable } from '../people.js';
import { josa } from '../text.js';
import { allOf, needCapable, needStock } from './helpers.js';

const CAN = SERVINGS;
const family = (game) => game.presentPeople().filter((p) => !p.isPlayer);

/** 약탈자에게 빼앗기는 몫: 식량·물 절반, 구급약·건전지 전부 */
function plunder(ctx) {
  const food = ctx.take('food', Math.ceil(ctx.game.stock.food / 2));
  const water = ctx.take('water', Math.ceil(ctx.game.stock.water / 2));
  const med = ctx.take('med', ctx.game.stock.med);
  ctx.take('battery', ctx.game.stock.battery);
  return food + water + med;
}

/** 놈들을 쫓아냈다: 다시는 오지 않는다 */
function drivenOff(ctx) {
  ctx.game.flags.gangGone = true;
  ctx.game.flags.gangAnger = 0;
}

export const VISITOR_EVENTS = [
  {
    id: 'white_robes',
    title: '하얀 옷의 사람들',
    weight: 1.3,
    minDay: 16,
    cooldown: 10,
    maxCount: 5,
    when: (game) => !game.flags.robesGone,
    text(game) {
      const visits = game.flags.robes;
      if (visits === 0) {
        return '하얀 옷을 입은 사람들이 거리 한가운데서 노래를 부르며 지나간다. 이상하게도 좀비들이 그들을 그냥 지나친다. 한 사람이 우리 창문을 올려다보며 손을 흔든다.';
      }
      if (visits === 1) {
        return '하얀 옷의 사람들이 다시 왔다. 문 앞에 들꽃과 깨끗한 물 한 병을 두고 간다. 쪽지가 끼워져 있다. "정원에서는 아무도 굶지 않습니다."';
      }
      return '하얀 옷의 무리가 문 앞에 모였다. 맨 앞의 남자가 부드럽게 말한다. "때가 되었습니다. 문을 여세요. 정원으로 함께 갑시다. 그곳에선 아무도 아프지 않습니다."';
    },
    options: [
      {
        id: 'join',
        label: '문을 열고 그들을 따라간다',
        note: '다시는 이 집으로 돌아오지 않는다',
        check: (game) => (game.flags.robes < 2 ? '아직 그들이 누구인지 모른다' : null),
        resolve(ctx) {
          ctx.end('cult');
          return '하얀 옷을 받아 입었다. 노래를 따라 걸었다. 뒤돌아보니 우리 집 문이 열린 채로 흔들리고 있었다.';
        },
      },
      {
        id: 'wave',
        label: '창문 너머로 손을 흔들어 답한다',
        check: (game) => (game.flags.robes >= 2 ? '그들은 이제 대답 대신 문을 열어 주기를 기다린다' : null),
        resolve(ctx) {
          const visits = ctx.game.flags.robes;
          ctx.game.flags.robes += 1;
          for (const p of ctx.family()) ctx.mood(p, -1);
          if (visits === 1) {
            ctx.give('water', CAN);
            return '문 앞의 물병을 들여왔다. 깨끗한 물이었다. 들꽃은 빈 병에 꽂아 두었다. (물 +1병)';
          }
          return '그들은 고개를 끄덕이고 노래를 이어 갔다. 노랫소리가 오래 귀에 남았다.';
        },
      },
      {
        id: 'refuse',
        label: '커튼을 치고 모르는 척한다',
        resolve(ctx) {
          if (ctx.game.flags.robes >= 2) {
            ctx.game.flags.robesGone = true;
            return '한참 뒤 노랫소리가 멀어졌다. 그들은 다시 오지 않았다. 문 앞에 하얀 꽃 한 송이가 남아 있었다.';
          }
          ctx.game.flags.robes += 1;
          return '커튼 틈으로 지켜보는 사이, 하얀 무리는 노래를 부르며 사라졌다.';
        },
      },
    ],
  },
  {
    id: 'gang_note',
    title: '약탈자의 쪽지',
    weight: 1.6,
    minDay: 20,
    cooldown: 7,
    maxCount: 6,
    when: (game) => !game.flags.gangGone && game.flags.gangAnger < 2,
    text: (game) =>
      game.flags.gangAnger === 0
        ? '아침에 보니 현관문에 붉은 페인트로 해골이 그려져 있다. 쪽지가 꽂혀 있다. "이 동네는 우리 구역이다. 통조림 1캔과 물 1병을 문 앞에 둬라. 안 그러면 다시 온다."'
        : '또 쪽지다. 글씨가 거칠어졌다. "마지막 경고다. 통조림 1캔, 물 1병. 무시하면 문을 부수고 들어간다."',
    options: [
      {
        id: 'pay',
        label: '문 앞에 놓아 둔다',
        cost: '통조림 1캔 · 물 1병',
        check: allOf(needStock('food', CAN), needStock('water', CAN)),
        resolve(ctx) {
          ctx.take('food', CAN);
          ctx.take('water', CAN);
          return '다음 날 아침, 놓아 둔 것이 감쪽같이 사라져 있었다. 대신 해골 그림 위에 줄이 하나 그어져 있었다. (통조림 -1캔, 물 -1병)';
        },
      },
      {
        id: 'ambush',
        who: 'dad',
        label: '아빠가 밤새 문 뒤에서 기다린다',
        note: (game) => (game.stock.weapon > 0 ? '야구 방망이를 든다' : '맨손이다'),
        check: needCapable('dad'),
        resolve(ctx) {
          const dad = ctx.person('dad');
          const armed = ctx.has('weapon');
          if (ctx.rng.chance(armed ? 0.75 : 0.5)) {
            drivenOff(ctx);
            return `새벽, 쪽지를 가지러 온 놈을 아빠가 붙잡아 내동댕이쳤다. "다시 오면 이걸로 끝나지 않는다." 놈은 절뚝이며 달아났고, 다시는 오지 않았다.`;
          }
          ctx.injure(dad);
          ctx.game.flags.gangAnger += 1;
          return `새벽에 몸싸움이 벌어졌다. 놈들은 셋이었다. ${josa(dad.name, '은/는')} 얻어맞고 쓰러졌고, 놈들은 웃으며 돌아갔다. "다음엔 다 같이 오지."`;
        },
      },
      {
        id: 'ignore',
        label: '쪽지를 구겨 버린다',
        resolve(ctx) {
          ctx.game.flags.gangAnger += 1;
          return ctx.game.flags.gangAnger >= 2
            ? '쪽지를 또 구겨 버렸다. 그날 밤, 집 주변을 맴도는 발소리가 끊이지 않았다.'
            : '쪽지를 구겨 버렸다. 밤새 바깥에서 휘파람 소리가 들렸다.';
        },
      },
    ],
  },
  {
    id: 'gang_raid',
    title: '약탈자의 습격',
    weight: 10,
    minDay: 20,
    cooldown: 2,
    when: (game) => !game.flags.gangGone && game.flags.gangAnger >= 2,
    text: () => '한밤중, 문짝을 부수는 소리에 잠이 깼다. 쇠파이프를 든 사람들이 현관으로 밀고 들어온다. "경고했지?"',
    options: [
      {
        id: 'fight',
        who: 'dad',
        label: '아빠가 앞을 막아선다',
        check: needCapable('dad'),
        resolve(ctx) {
          const dad = ctx.person('dad');
          const armed = ctx.has('weapon');
          if (ctx.rng.chance(armed ? 0.8 : 0.55)) {
            drivenOff(ctx);
            if (ctx.danger(0.4)) ctx.injure(dad);
            return `${josa(dad.name, '이/가')} ${armed ? '방망이를 휘두르며' : '맨주먹으로'} 현관을 막아섰다. 한참의 난투 끝에 놈들이 물러났다. 다시는 이 집 근처에 얼씬하지 않았다.${dad.health ? ` ${josa(dad.name, '은/는')} 다쳤다.` : ''}`;
          }
          ctx.injure(dad, 2);
          plunder(ctx);
          ctx.game.flags.gangAnger = 0;
          return `${josa(dad.name, '은/는')} 버텼지만 혼자서는 무리였다. 쓰러진 ${josa(dad.name, '을/를')} 밟고 놈들이 선반을 쓸어 갔다. 식량과 물 절반, 구급약과 건전지를 모두 빼앗겼다.`;
        },
      },
      {
        id: 'bat',
        label: '야구 방망이를 들고 맞선다',
        check: needStock('weapon'),
        resolve(ctx) {
          if (ctx.rng.chance(0.5)) {
            drivenOff(ctx);
            return '방망이를 마구 휘두르며 소리를 질렀다. 앞장선 놈이 비명을 지르며 넘어지자 나머지가 달아났다. 다시는 오지 않았다.';
          }
          ctx.injure(ctx.game.me);
          plunder(ctx);
          ctx.game.flags.gangAnger = 0;
          return '방망이를 빼앗기고 바닥에 내동댕이쳐졌다. 놈들이 식량과 물 절반, 구급약과 건전지를 모두 가져갔다.';
        },
      },
      {
        id: 'give',
        label: '가진 것을 내준다',
        resolve(ctx) {
          const taken = plunder(ctx);
          ctx.game.flags.gangAnger = 0;
          if (taken === 0) {
            ctx.end('raiders');
            return '줄 것이 아무것도 없다는 걸 알자, 놈들은 우리를 문밖으로 끌어냈다. "이 집은 이제 우리 거다."';
          }
          return '놈들이 선반을 쓸어 갔다. 식량과 물 절반, 구급약과 건전지를 모두 잃었다. "다음 달에 또 보지."';
        },
      },
      {
        id: 'flee',
        label: '뒷문으로 달아난다',
        note: '집을 버린다',
        resolve(ctx) {
          ctx.end('raiders');
          const who = family(ctx.game).filter((p) => isCapable(p) || p.health < 2);
          return `${who.length ? '식구들의 손을 잡고' : '혼자'} 뒷문으로 빠져나왔다. 등 뒤에서 우리 집 창문이 깨지는 소리가 들렸다.`;
        },
      },
    ],
  },
];
