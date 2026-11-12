// 아포칼립스 난이도에서만 일어나는 사건: 세상이 더 빨리 무너지고 있다는 징조.
import { SERVINGS, formatAmount } from '../items.js';
import { josa } from '../text.js';
import { needCapable, needStock } from './helpers.js';

const CAN = SERVINGS;
const onlyApocalypse = (game) => game.difficulty.id === 'apocalypse';
const family = (game) => game.presentPeople().filter((p) => !p.isPlayer);

export const APOCALYPSE_EVENTS = [
  {
    id: 'mutant',
    title: '변이 좀비',
    apocalypse: true,
    weight: 2,
    minDay: 8,
    cooldown: 10,
    when: onlyApocalypse,
    text: () => '창살이 휘어 있다. 팔다리가 비정상적으로 긴 좀비가 담벼락을 기어올라 집 안을 들여다본다. 보통 좀비와는 다르다.',
    options: [
      {
        id: 'flare',
        label: '신호탄을 쏘아 다른 쪽으로 유인한다',
        cost: '신호탄 1',
        check: needStock('flare'),
        resolve(ctx) {
          ctx.take('flare', 1);
          return '붉은 불꽃이 골목 끝으로 날아가자, 그것은 네 발로 뛰어 불빛을 쫓아갔다. (신호탄 -1)';
        },
      },
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 쇠파이프로 맞선다',
        check: needCapable('dad'),
        resolve(ctx) {
          const dad = ctx.person('dad');
          if (ctx.danger(0.6)) {
            ctx.injure(dad, ctx.danger(0.3) ? 2 : 1);
            return `창틀에서 한참을 싸웠다. 그것은 결국 떨어져 나갔지만 ${josa(dad.name, '은/는')} 크게 다쳤다.`;
          }
          return `${josa(dad.name, '이/가')} 창살 사이로 쇠파이프를 내리꽂았다. 그것은 비명을 지르며 사라졌다.`;
        },
      },
      {
        id: 'hide',
        label: '모두 욕실에 숨어 숨죽인다',
        resolve(ctx) {
          const food = ctx.take('food', Math.ceil(ctx.game.stock.food * 0.3));
          const water = ctx.take('water', Math.ceil(ctx.game.stock.water * 0.2));
          for (const p of family(ctx.game)) ctx.mood(p, +1);
          const lost = [food ? formatAmount('food', food) : '', water ? formatAmount('water', water) : ''].filter(Boolean).join(', ');
          return `문틈으로 그것이 거실을 헤집는 소리가 들렸다. 날이 밝고서야 나왔다.${lost ? ` 선반이 엉망이다. (${lost} 잃음)` : ''}`;
        },
      },
    ],
  },
  {
    id: 'acid_rain',
    title: '산성비',
    apocalypse: true,
    weight: 1.6,
    minDay: 6,
    cooldown: 12,
    when: onlyApocalypse,
    text: () => '노란빛이 도는 비가 내리기 시작했다. 빗물이 닿은 창틀 페인트가 부글거리며 벗겨진다. 천장에서 물이 새기 시작했다.',
    options: [
      {
        id: 'toolkit',
        label: '공구 상자로 새는 곳을 막는다',
        check: needStock('toolkit'),
        resolve: () => '비닐과 테이프로 천장을 막았다. 빗물은 한 방울도 들어오지 않았다.',
      },
      {
        id: 'buckets',
        label: '그릇을 받쳐 새는 빗물을 받아 낸다',
        resolve(ctx) {
          const present = ctx.present();
          if (ctx.danger(0.35)) {
            const p = ctx.rng.pick(present);
            ctx.injure(p);
            return `그릇을 비우다 ${p.isPlayer ? '내' : `${p.name}의`} 손에 빗물이 튀었다. 살갗이 벌겋게 일어났다.`;
          }
          return '밤새 그릇을 비우느라 잠을 못 잤지만, 선반은 무사했다.';
        },
      },
      {
        id: 'endure',
        label: '그냥 둔다',
        resolve(ctx) {
          const lost = ctx.take('water', Math.ceil(ctx.game.stock.water * 0.3));
          return lost
            ? `새는 빗물이 물병 상자를 적셨다. 오염된 ${josa(formatAmount('water', lost), '을/를')} 버렸다.`
            : '새는 빗물이 바닥을 적셨다. 다행히 버릴 물도 없었다.';
        },
      },
    ],
  },
  {
    id: 'bombing',
    title: '소각 폭격 경보',
    apocalypse: true,
    weight: 1,
    minDay: 15,
    cooldown: 20,
    when: onlyApocalypse,
    text: () => '하늘에서 확성기 소리가 울린다. "이 구역은 감염 구역으로 지정되었습니다. 오늘 밤 소각 폭격이 있습니다. 반복합니다…"',
    options: [
      {
        id: 'leave',
        label: '하룻밤 옆 동네로 피했다 돌아온다',
        note: '빈집에 무엇이 남아 있을지 모른다',
        resolve(ctx) {
          const food = ctx.take('food', Math.ceil(ctx.game.stock.food * 0.25));
          return `멀리서 폭음이 밤새 이어졌다. 돌아와 보니 집은 그대로였지만 누가 다녀갔다.${food ? ` (${formatAmount('food', food)} 잃음)` : ''}`;
        },
      },
      {
        id: 'cellar',
        label: '지하 창고 바닥에 모두 엎드린다',
        resolve(ctx) {
          for (const p of family(ctx.game)) ctx.mood(p, +1);
          if (ctx.danger(0.3)) {
            const p = ctx.rng.pick(ctx.present());
            ctx.injure(p);
            return `폭음에 천장이 내려앉을 듯 흔들렸다. 떨어진 선반에 ${p.isPlayer ? '내가' : josa(p.name, '이/가')} 다쳤다.`;
          }
          return '밤새 땅이 흔들렸다. 아침에 나가 보니 두 블록 너머가 잿더미가 되어 있었다.';
        },
      },
    ],
  },
  {
    id: 'turned_neighbor',
    title: '변해 버린 이웃',
    apocalypse: true,
    weight: 1.2,
    minDay: 10,
    maxCount: 1,
    when: onlyApocalypse,
    text: () => '옆집에서 벽을 치는 소리가 사흘째 이어진다. 옆집 아저씨였던 것이 벽 너머에서 우리 이름을 부르듯 신음한다.',
    options: [
      {
        id: 'dad',
        who: 'dad',
        label: '아빠가 가서 끝을 내 준다',
        check: needCapable('dad'),
        resolve(ctx) {
          const dad = ctx.person('dad');
          if (ctx.danger(0.4)) ctx.injure(dad);
          ctx.mood(dad, +1);
          const found = ctx.loot(2);
          return `한참 뒤 돌아온 ${josa(dad.name, '은/는')} 아무 말도 하지 않았다. 손에는 옆집 찬장에서 챙긴 것들이 들려 있었다.${dad.health ? ' 팔에 긁힌 자국이 있다.' : ''} (얻은 것: ${found.length}개)`;
        },
      },
      {
        id: 'toolkit',
        label: '공구 상자로 벽에 판자를 덧대 소리를 막는다',
        check: needStock('toolkit'),
        resolve: () => '판자를 세 겹 덧댔다. 소리는 작아졌지만 완전히 멎지는 않았다.',
      },
      {
        id: 'endure',
        label: '모르는 척 견딘다',
        resolve(ctx) {
          for (const p of family(ctx.game)) ctx.mood(p, +1);
          return '밤마다 벽 너머의 소리가 꿈까지 따라왔다.';
        },
      },
    ],
  },
];

