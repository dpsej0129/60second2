// 갇혀 지내는 삶의 사건들: 마음 상태(우울·환청), 병, 날씨, 가족 사이의 일, 작은 기쁨.
// 마음 상태: 0 안정 · 1 지침 · 2 울적함 · 3 우울함 · 4 무너짐(환청·망상)
import { MOOD_DEPRESSED, MOOD_LOW } from '../constants.js';
import { ITEMS, SERVINGS } from '../items.js';
import { healthLabel, isCapable } from '../people.js';
import { josa } from '../text.js';
import { allOf, needCapable, needStock } from './helpers.js';

const CAN = SERVINGS;
const family = (game) => game.presentPeople().filter((p) => !p.isPlayer);
const pname = (game, id) => game.person(id).name;
const hasDog = (game) => (game.flags.dog ? null : '보리가 없다');

/** 조건에 맞는 가족 중 가장 심한 사람(같으면 무작위) */
function pickWorst(list, key, rng) {
  const worst = Math.max(...list.map((p) => p[key]));
  return rng.pick(list.filter((p) => p[key] === worst)).id;
}

const momCanHelp = (target) => (game) => {
  const reason = needCapable('mom')(game);
  if (reason) return reason;
  return target(game) === 'mom' ? '엄마 자신의 일이다' : null;
};

export const LIFE_EVENTS = [
  // ── 마음 ─────────────────────────────────────
  {
    id: 'depression',
    title: '깊은 우울',
    weight: 4,
    minDay: 6,
    cooldown: 3,
    when: (game) => family(game).some((p) => p.mood >= MOOD_LOW),
    setup: (game, rng) => ({ target: pickWorst(family(game).filter((p) => p.mood >= MOOD_LOW), 'mood', rng) }),
    text: (game, params) =>
      `${josa(pname(game, params.target), '이/가')} 하루 종일 벽만 보고 누워 있다. 밥도 먹기 싫고, 다 소용없다고 중얼거린다.`,
    options: [
      {
        id: 'listen',
        label: '마주 앉아 이야기를 들어 준다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          if (ctx.rng.chance(0.6)) {
            ctx.mood(p, -1);
            return `한참 이야기를 들어 주었다. ${josa(p.name, '이/가')} 처음으로 조금 웃었다.`;
          }
          p.talkedToday = true;
          return `${josa(p.name, '은/는')} 끝내 입을 열지 않았다. 그래도 곁을 지켰다.`;
        },
      },
      {
        id: 'mom',
        who: 'mom',
        label: '엄마가 차분히 상담해 준다',
        check: momCanHelp((game) => game.event.params.target),
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, -2);
          return `엄마가 ${josa(p.name, '을/를')} 꼭 안고 오래 이야기를 나눴다. 눈빛이 한결 맑아졌다.`;
        },
      },
      {
        id: 'feast',
        label: '아껴 둔 통조림을 따서 다 같이 먹는다',
        cost: '통조림 1캔',
        check: needStock('food', CAN),
        resolve(ctx) {
          ctx.take('food', CAN);
          for (const p of ctx.present()) {
            p.hunger = 0;
            ctx.mood(p, -1);
          }
          return '오랜만에 다 같이 둘러앉아 한 캔을 나눠 먹었다. 별것 아닌 농담에 다들 웃었다. (통조림 -1캔)';
        },
      },
      {
        id: 'dog',
        tag: '보리',
        label: '보리를 곁에 붙여 준다',
        check: hasDog,
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, -1);
          return `보리가 ${p.name}의 품을 파고들어 잠들었다. ${josa(p.name, '은/는')} 보리를 오래 쓰다듬었다.`;
        },
      },
      {
        id: 'leave',
        label: '혼자 있게 둔다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          if (ctx.danger(0.5)) {
            ctx.mood(p, +1);
            return `${josa(p.name, '은/는')} 더 깊이 가라앉았다.`;
          }
          return '시간이 약이길 바랄 뿐이다.';
        },
      },
    ],
  },
  {
    id: 'voices',
    title: '들리지 않는 목소리',
    weight: 7,
    minDay: 8,
    cooldown: 2,
    when: (game) => family(game).some((p) => p.mood >= MOOD_DEPRESSED),
    setup: (game, rng) => ({ target: pickWorst(family(game).filter((p) => p.mood >= MOOD_DEPRESSED), 'mood', rng) }),
    text(game, params) {
      const name = pname(game, params.target);
      const mom = game.person('mom');
      const note =
        params.target !== 'mom' && isCapable(mom)
          ? ' 엄마는 조현병 증상과 비슷하다며, 다그치거나 몰아세우면 더 나빠진다고 했다.'
          : ' 오래 갇혀 지낸 탓일까. 조현병 증상처럼 보인다.';
      return `${josa(name, '이/가')} 아무도 없는 구석을 향해 속삭인다. 벽 너머에서 누가 자기를 부르고, 우리가 자기 몫의 물을 몰래 버린다고 믿고 있다. 겁에 질린 얼굴이다.${note}`;
    },
    options: [
      {
        id: 'stay',
        label: '곁에 앉아 차분히 들어 준다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          p.talkedToday = true;
          if (ctx.rng.chance(0.55)) {
            ctx.mood(p, -1);
            return `밤새 곁을 지키며 이야기를 들었다. 목소리가 조금 잦아들었다고 했다.`;
          }
          return '밤새 곁을 지켰다. 나아지지는 않았지만 더 나빠지지도 않았다.';
        },
      },
      {
        id: 'mom',
        who: 'mom',
        label: '엄마가 돌본다',
        check: momCanHelp((game) => game.event.params.target),
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, -2);
          return `엄마가 ${josa(p.name, '을/를')} 밝은 쪽으로 데려가 천천히 숨을 고르게 했다. 목소리가 멀어졌다고 한다.`;
        },
      },
      {
        id: 'med',
        label: '구급상자의 진정제를 먹여 재운다',
        cost: '구급약 1회분',
        check: needStock('med'),
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.take('med', 1);
          ctx.mood(p, -1);
          return `${josa(p.name, '은/는')} 깊이 잠들었다. 깨어나서는 한결 차분해졌다. (구급약 -1)`;
        },
      },
      {
        id: 'argue',
        label: '그런 목소리는 없다고 몰아세운다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, +1);
          return `${josa(p.name, '은/는')} 더 겁에 질려 구석으로 숨어 버렸다. 몰아세운 게 잘못이었다.`;
        },
      },
      {
        id: 'leave',
        label: '혼자 진정하도록 둔다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          if (ctx.danger(0.4)) {
            p.status = 'lost';
            return `그날 밤, ${josa(p.name, '이/가')} 문을 열고 나갔다. 목소리를 따라간 걸까. 다시 돌아오지 않았다.`;
          }
          return '다행히 지쳐 잠들었다.';
        },
      },
    ],
  },
  {
    id: 'nightmare',
    title: '악몽',
    weight: 2,
    minDay: 3,
    cooldown: 4,
    when: (game) => family(game).length > 0,
    setup: (game, rng) => ({ target: rng.pick(family(game)).id }),
    text: (game, params) => `한밤중, ${josa(pname(game, params.target), '이/가')} 비명을 지르며 깼다. 꿈에서 마트의 좀비들이 쫓아왔다고 한다.`,
    options: [
      {
        id: 'water',
        label: '물 한 모금을 먹이고 달랜다',
        cost: '물 ¼병',
        check: needStock('water'),
        resolve(ctx) {
          ctx.take('water', 1);
          const p = ctx.person(ctx.params.target);
          p.thirst = 0;
          p.talkedToday = true;
          return `물을 마시고 한참 등을 쓸어 주자 ${josa(p.name, '은/는')} 다시 잠들었다. (물 -¼병)`;
        },
      },
      {
        id: 'hug',
        label: '꼭 안아 준다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          if (ctx.danger(0.4)) {
            ctx.mood(p, +1);
            return `${josa(p.name, '은/는')} 새벽까지 떨며 잠들지 못했다.`;
          }
          p.talkedToday = true;
          return '품 안에서 숨소리가 차츰 고르게 돌아왔다.';
        },
      },
      {
        id: 'ignore',
        label: '모른 척 다시 잔다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, +1);
          return `${josa(p.name, '은/는')} 혼자 이불 속에서 오래 울었다.`;
        },
      },
    ],
  },
  {
    id: 'cabin_fever',
    title: '답답함',
    weight: 2.5,
    minDay: 10,
    cooldown: 6,
    when: (game) => family(game).some((p) => p.mood >= 1 && isCapable(p)),
    setup: (game, rng) => ({ target: rng.pick(family(game).filter((p) => p.mood >= 1 && isCapable(p))).id }),
    text: (game, params) =>
      `${josa(pname(game, params.target), '이/가')} 창문만 바라보다 말한다. "딱 오 분만. 바깥 공기 한 번만 마시고 올게." 몇 주째 햇빛을 못 봤다.`,
    options: [
      {
        id: 'yard',
        label: '잠깐 마당까지만 나가게 해 준다',
        note: '좀비에게 들킬 수 있다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, -1);
          if (ctx.danger(0.2)) {
            ctx.injure(p);
            return `${josa(p.name, '은/는')} 햇볕 아래서 한참 눈을 감고 있다가… 담장 너머 좀비에게 팔을 긁혔다. (${p.name}: ${healthLabel(p.health).text})`;
          }
          return `${josa(p.name, '은/는')} 햇볕 아래서 한참 눈을 감고 서 있다가 돌아왔다. 얼굴에 핏기가 돌았다.`;
        },
      },
      {
        id: 'window',
        label: '창문 틈을 조금 열어 준다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          if (ctx.rng.chance(0.5)) {
            ctx.mood(p, -1);
            return '창틈으로 들어온 바람에 다들 숨이 조금 트였다.';
          }
          return '바람 대신 썩은 냄새가 들어왔다. 창문을 도로 닫았다.';
        },
      },
      {
        id: 'no',
        label: '안 된다고 단호하게 말한다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, +1);
          return `${josa(p.name, '은/는')} 대꾸 없이 돌아누웠다.`;
        },
      },
    ],
  },
  {
    id: 'argument',
    title: '말다툼',
    weight: 2.5,
    minDay: 7,
    cooldown: 5,
    when: (game) => family(game).length >= 2 && game.presentPeople().some((p) => p.mood >= 1 || p.hunger >= 2 || p.thirst >= 2),
    setup(game, rng) {
      const [a, b] = rng.shuffle(family(game));
      return { a: a.id, b: b.id };
    },
    text: (game, params) =>
      `${pname(game, params.a)}와 ${josa(pname(game, params.b), '이/가')} 마지막 남은 물병을 두고 언성을 높인다. 서로 상대가 몰래 더 마셨다고 우긴다.`,
    options: [
      {
        id: 'a',
        label: (game, params) => `${pname(game, params.a)} 편을 든다`,
        resolve(ctx) {
          const loser = ctx.person(ctx.params.b);
          ctx.mood(loser, +1);
          return `${josa(loser.name, '은/는')} 서운한 얼굴로 입을 다물었다.`;
        },
      },
      {
        id: 'b',
        label: (game, params) => `${pname(game, params.b)} 편을 든다`,
        resolve(ctx) {
          const loser = ctx.person(ctx.params.a);
          ctx.mood(loser, +1);
          return `${josa(loser.name, '은/는')} 서운한 얼굴로 입을 다물었다.`;
        },
      },
      {
        id: 'mediate',
        label: '둘을 앉혀 놓고 중재한다',
        resolve(ctx) {
          const a = ctx.person(ctx.params.a);
          const b = ctx.person(ctx.params.b);
          if (ctx.rng.chance(0.5)) {
            ctx.mood(a, -1);
            ctx.mood(b, -1);
            return '한참 이야기한 끝에 둘이 멋쩍게 웃었다. 오해였다.';
          }
          return '말다툼은 멈췄지만 집 안 공기는 여전히 차갑다.';
        },
      },
    ],
  },
  // ── 작은 기쁨 ────────────────────────────────
  {
    id: 'birthday',
    title: '생일',
    weight: 1.5,
    minDay: 5,
    cooldown: 15,
    maxCount: 3,
    when: (game) => family(game).length > 0,
    setup: (game, rng) => ({ target: rng.pick(family(game)).id }),
    text: (game, params) => `벽에 그어 둔 날짜를 세어 보다 알았다. 오늘은 ${pname(game, params.target)}의 생일이다.`,
    options: [
      {
        id: 'party',
        label: '아껴 둔 통조림으로 상을 차린다',
        cost: '통조림 1캔',
        check: needStock('food', CAN),
        resolve(ctx) {
          ctx.take('food', CAN);
          const p = ctx.person(ctx.params.target);
          for (const q of ctx.family()) ctx.mood(q, -1);
          ctx.mood(p, -1);
          return `통조림 하나에 양초 대신 성냥을 꽂았다. 다 같이 노래를 불렀다. ${josa(p.name, '은/는')} 울다가 웃었다. (통조림 -1캔)`;
        },
      },
      {
        id: 'song',
        label: '노래만 불러 준다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, -1);
          return `작게, 좀비가 듣지 못할 만큼만 생일 노래를 불렀다. ${josa(p.name, '은/는')} 고맙다고 했다.`;
        },
      },
      {
        id: 'forget',
        label: '모르는 척 넘어간다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, +1);
          return `${josa(p.name, '은/는')} 하루 종일 아무 말도 하지 않았다.`;
        },
      },
    ],
  },
  {
    id: 'board_game',
    title: '낡은 보드게임',
    weight: 1.5,
    minDay: 4,
    maxCount: 1,
    when: (game) => family(game).length > 0,
    text: () => '다락 상자 속에서 먼지 쌓인 보드게임이 나왔다. 말 몇 개가 없지만 병뚜껑으로 대신하면 된다.',
    options: [
      {
        id: 'play',
        label: '다 같이 한 판 한다',
        resolve(ctx) {
          const players = ctx.family();
          for (const p of players) ctx.mood(p, -1);
          const loser = players.length ? ctx.rng.pick(players) : null;
          return `밤늦도록 웃음소리를 죽여 가며 게임을 했다.${loser ? ` ${josa(loser.name, '이/가')} 지고 나서 한 판만 더 하자고 졸랐다.` : ''}`;
        },
      },
      { id: 'burn', label: '불쏘시개로 쓴다', resolve: () => '종이 상자는 잘 탔다. 손이 조금 따뜻해졌다.' },
    ],
  },
  {
    id: 'radio_music',
    title: '라디오에서 흐르는 노래',
    weight: 2,
    minDay: 6,
    cooldown: 8,
    when: (game) => game.stock.radio > 0,
    text: () => '무전기 다이얼을 돌리다 오래된 가요가 잡혔다. 누가 아직 방송을 하고 있다.',
    options: [
      {
        id: 'listen',
        label: '건전지를 넣고 끝까지 듣는다',
        cost: '건전지 1',
        check: needStock('battery'),
        resolve(ctx) {
          ctx.take('battery', 1);
          const listeners = ctx.family();
          for (const p of listeners) ctx.mood(p, -1);
          const singer = listeners.length ? ctx.rng.pick(listeners) : null;
          return `${listeners.length ? '다 같이' : '혼자'} 눈을 감고 노래를 들었다.${singer ? ` ${josa(singer.name, '이/가')} 작게 따라 불렀다.` : ''} (건전지 -1)`;
        },
      },
      { id: 'off', label: '건전지를 아끼려고 끈다', resolve: () => '노래는 첫 소절에서 끊겼다.' },
    ],
  },
  {
    id: 'note',
    title: '문틈의 쪽지',
    weight: 1,
    minDay: 10,
    maxCount: 1,
    text: () => '아침에 보니 누군가 문틈으로 쪽지를 밀어 넣었다. "포기하지 마세요. 우리도 아직 여기 있어요. — 3층"',
    options: [
      {
        id: 'pin',
        label: '벽에 붙여 둔다',
        resolve(ctx) {
          for (const p of ctx.family()) ctx.mood(p, -1);
          return '삐뚤빼뚤한 글씨를 다들 몇 번이고 읽었다.';
        },
      },
      { id: 'toss', label: '함정일지 모르니 버린다', resolve: () => '쪽지를 구겨 난로에 넣었다.' },
    ],
  },
  // ── 병 ───────────────────────────────────────
  {
    id: 'dysentery',
    title: '배앓이',
    weight: 2,
    minDay: 5,
    cooldown: 6,
    when: (game) => game.presentPeople().some((p) => p.health === 0),
    setup: (game, rng) => ({ target: rng.pick(game.presentPeople().filter((p) => p.health === 0)).id }),
    text: (game, params) => `어젯밤 마신 물이 이상했나 보다. ${josa(pname(game, params.target), '이/가')} 배를 움켜쥐고 식은땀을 흘린다.`,
    options: [
      {
        id: 'med',
        label: '구급약을 먹인다',
        cost: '구급약 1회분',
        check: needStock('med'),
        resolve(ctx) {
          ctx.take('med', 1);
          return '약을 먹고 반나절을 앓더니 가라앉았다. (구급약 -1)';
        },
      },
      {
        id: 'boil',
        label: '물을 끓여 계속 마시게 한다',
        cost: '물 ½병',
        check: needStock('water', 2),
        resolve(ctx) {
          ctx.take('water', 2);
          const p = ctx.person(ctx.params.target);
          p.thirst = 0;
          if (ctx.danger(0.35)) {
            ctx.injure(p);
            return `물을 끓여 계속 먹였지만 결국 앓아누웠다. (물 -½병, ${p.name}: ${healthLabel(p.health).text})`;
          }
          return '끓인 물을 조금씩 먹이자 밤에는 가라앉았다. (물 -½병)';
        },
      },
      {
        id: 'endure',
        label: '그냥 버티게 한다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.injure(p);
          return `${josa(p.name, '은/는')} 밤새 앓다가 기운이 쭉 빠졌다. (${p.name}: ${healthLabel(p.health).text})`;
        },
      },
    ],
  },
  {
    id: 'fever',
    title: '고열',
    weight: 2,
    minDay: 10,
    cooldown: 8,
    when: (game) => game.presentPeople().some((p) => p.health === 0),
    setup: (game, rng) => ({ target: rng.pick(game.presentPeople().filter((p) => p.health === 0)).id }),
    text: (game, params) => `${josa(pname(game, params.target), '이/가')} 불덩이처럼 뜨겁다. 기침도 심하다. 옮을까 봐 다들 조금씩 떨어져 앉았다.`,
    options: [
      {
        id: 'med',
        label: '해열제를 먹인다',
        cost: '구급약 1회분',
        check: needStock('med'),
        resolve(ctx) {
          ctx.take('med', 1);
          return '이틀 밤을 앓고 열이 내렸다. (구급약 -1)';
        },
      },
      {
        id: 'mom',
        who: 'mom',
        label: '엄마가 밤새 간호한다',
        check: momCanHelp((game) => game.event.params.target),
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          if (ctx.danger(0.3)) {
            ctx.injure(ctx.person('mom'));
            return `${josa(p.name, '은/는')} 열이 내렸지만, 이번엔 엄마가 앓아누웠다. (엄마: 부상)`;
          }
          return `엄마가 밤새 물수건을 갈아 주었다. ${josa(p.name, '은/는')} 아침에 미음을 조금 먹었다.`;
        },
      },
      {
        id: 'endure',
        label: '찬 물수건으로 버틴다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.injure(p);
          const others = ctx.present().filter((q) => q !== p && q.health === 0);
          if (others.length && ctx.danger(0.35)) {
            const q = ctx.rng.pick(others);
            ctx.injure(q);
            return `열은 쉽게 내리지 않았다. 다음 날에는 ${q.name}도 기침을 시작했다. (${p.name}, ${q.name}: 부상)`;
          }
          return `열은 쉽게 내리지 않았다. (${p.name}: ${healthLabel(p.health).text})`;
        },
      },
    ],
  },
  {
    id: 'toothache',
    title: '치통',
    weight: 1.5,
    minDay: 8,
    cooldown: 10,
    when: (game) => family(game).length > 0,
    setup: (game, rng) => ({ target: rng.pick(family(game)).id }),
    text: (game, params) => `${josa(pname(game, params.target), '이/가')} 볼을 감싸 쥐고 끙끙댄다. 어금니가 썩어 들어간 모양이다.`,
    options: [
      {
        id: 'med',
        label: '진통제를 먹인다',
        cost: '구급약 1회분',
        check: needStock('med'),
        resolve(ctx) {
          ctx.take('med', 1);
          return '약 기운에 겨우 잠들었다. (구급약 -1)';
        },
      },
      {
        id: 'pull',
        label: '실로 묶어 뽑는다',
        note: '덧날 수 있다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          if (ctx.danger(0.3)) {
            ctx.injure(p);
            return `이는 뽑혔지만 잇몸이 퉁퉁 부어올랐다. (${p.name}: ${healthLabel(p.health).text})`;
          }
          return '눈물을 쏙 뺐지만 이는 깔끔하게 빠졌다.';
        },
      },
      {
        id: 'endure',
        label: '참으라고 한다',
        resolve(ctx) {
          const p = ctx.person(ctx.params.target);
          ctx.mood(p, +1);
          return `${josa(p.name, '은/는')} 며칠 내내 잠을 설쳤다.`;
        },
      },
    ],
  },
  // ── 집과 날씨 ─────────────────────────────────
  {
    id: 'pipe_leak',
    title: '새는 수도관',
    weight: 1.5,
    minDay: 4,
    cooldown: 15,
    text: () => '벽 속 수도관에서 물이 똑, 똑 떨어진다. 녹물이지만 끓이면 마실 수 있을 것이다.',
    options: [
      {
        id: 'toolkit',
        label: '공구로 관을 따서 남은 물을 받는다',
        check: needStock('toolkit'),
        resolve(ctx) {
          ctx.give('water', 2 * CAN);
          return '렌치로 이음매를 풀자 고여 있던 물이 콸콸 쏟아졌다. 냄비를 다 동원했다. (물 +2병)';
        },
      },
      {
        id: 'pot',
        label: '냄비를 받쳐 모은다',
        resolve(ctx) {
          ctx.give('water', 3);
          return '하루 종일 모으니 제법 됐다. (물 +¾병)';
        },
      },
      { id: 'ignore', label: '신경 쓰지 않는다', resolve: () => '똑, 똑. 밤새 그 소리만 들렸다.' },
    ],
  },
  {
    id: 'cold_snap',
    title: '한파',
    weight: 1.5,
    minDay: 15,
    cooldown: 12,
    text: () => '밤새 기온이 뚝 떨어졌다. 입김이 하얗고, 손끝이 곱는다.',
    options: [
      {
        id: 'fuel',
        label: '연료를 조금 태워 몸을 녹인다',
        cost: '연료통 1',
        check: needStock('fuel'),
        resolve(ctx) {
          ctx.take('fuel', 1);
          return '깡통 난로에 불을 피우자 다들 그 앞으로 모여들었다. (연료통 -1)';
        },
      },
      {
        id: 'huddle',
        label: '이불을 모아 서로 꼭 붙어 잔다',
        resolve(ctx) {
          const weak = ctx.present().filter((p) => p.health >= 1);
          if (weak.length && ctx.danger(0.4)) {
            const p = ctx.rng.pick(weak);
            ctx.injure(p);
            return `다들 이를 덜덜 떨며 밤을 새웠다. 다친 ${josa(p.name, '은/는')} 상태가 나빠졌다. (${p.name}: ${healthLabel(p.health).text})`;
          }
          return '다닥다닥 붙어 서로의 체온으로 버텼다.';
        },
      },
      {
        id: 'furniture',
        label: '가구를 뜯어 땐다',
        resolve(ctx) {
          const list = ctx.family();
          if (list.length) ctx.mood(ctx.rng.pick(list), +1);
          return '할머니가 물려주신 장롱을 뜯었다. 따뜻했지만, 마음 한구석이 서늘했다.';
        },
      },
    ],
  },
  {
    id: 'flyby',
    title: '헬기 소리',
    weight: 1.5,
    minDay: 6,
    cooldown: 15,
    maxCount: 2,
    text: () => '머리 위로 헬기 소리가 지나간다! 다들 창가로 몰려들었다.',
    options: [
      {
        id: 'flare',
        label: '신호탄을 쏜다',
        cost: '신호탄 1',
        check: needStock('flare'),
        resolve(ctx) {
          ctx.take('flare', 1);
          for (const p of ctx.family()) ctx.mood(p, +1);
          return '붉은 불꽃이 솟았다. 헬기는 멈추지 않고 지평선 너머로 사라졌다. 신호탄 하나만 날렸다. (신호탄 -1)';
        },
      },
      {
        id: 'shout',
        label: '창문을 열고 손을 흔들며 소리친다',
        note: '좀비가 들을 수 있다',
        resolve(ctx) {
          const present = ctx.present();
          if (present.length && ctx.danger(0.3)) {
            const p = ctx.rng.pick(present);
            ctx.injure(p);
            return `헬기는 듣지 못했다. 대신 좀비들이 창문으로 몰려들었고, ${josa(p.name, '이/가')} 손을 할퀴었다. (${p.name}: 부상)`;
          }
          return '목이 쉬도록 외쳤지만 헬기는 그대로 지나갔다.';
        },
      },
      {
        id: 'watch',
        label: '조용히 지켜본다',
        resolve: () => '헬기는 작아지다 점이 되었다. 누군가는 아직 하늘을 날고 있다.',
      },
    ],
  },
  {
    id: 'stranger_cough',
    title: '기침하는 낯선 사람',
    weight: 1.5,
    minDay: 8,
    cooldown: 12,
    maxCount: 2,
    text: () => '쿨럭이는 기침 소리와 함께 누군가 문을 두드린다. "하룻밤만… 재워 주세요. 내일 아침이면 떠날게요."',
    options: [
      {
        id: 'let_in',
        label: '들여 주고 먹을 것을 나눈다',
        cost: '통조림 ¼캔 · 물 ¼병',
        check: allOf(needStock('food'), needStock('water')),
        resolve(ctx) {
          ctx.take('food', 1);
          ctx.take('water', 1);
          const present = ctx.present();
          if (present.length && ctx.danger(0.3)) {
            const p = ctx.rng.pick(present);
            ctx.injure(p);
            return `남자는 새벽에 고맙다는 말만 남기고 떠났다. 며칠 뒤 ${josa(p.name, '이/가')} 기침을 시작했다. (${p.name}: 부상)`;
          }
          const [gift] = ctx.loot(1);
          return `남자는 새벽에 떠나며 배낭에서 ${josa(ITEMS[gift].name, '을/를')} 꺼내 두고 갔다. (얻은 것: ${ITEMS[gift].name})`;
        },
      },
      {
        id: 'water',
        label: '문틈으로 물만 건넨다',
        cost: '물 ¼병',
        check: needStock('water'),
        resolve(ctx) {
          ctx.take('water', 1);
          for (const p of ctx.family()) ctx.mood(p, -1);
          return '남자는 물병을 받고 몇 번이나 고개를 숙였다. 마음이 조금 놓였다. (물 -¼병)';
        },
      },
      { id: 'refuse', label: '문을 열지 않는다', resolve: () => '기침 소리가 골목 끝으로 멀어졌다.' },
    ],
  },
];

