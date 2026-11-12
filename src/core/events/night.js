// 밤사이 저절로 일어나는 일. 고를 것은 없고, 다음 날 아침 일지에 적힌다.
// 좋은 일과 나쁜 일이 섞여 있고, 난이도가 높을수록 나쁜 일이 잦다. apocalypse: 아포칼립스에서만 일어난다.
import { MOOD_MAX } from '../people.js';
import { SERVINGS, formatAmount } from '../items.js';
import { josa } from '../text.js';

const CAN = SERVINGS;

/** 밤마다 무언가 일어날 확률(난이도별) */
export const NIGHT_EVENT_CHANCE = { easy: 0.35, hard: 0.45, apocalypse: 0.55 };

const family = (game) => game.presentPeople().filter((p) => !p.isPlayer);
const moodUp = (p) => {
  if (p && !p.isPlayer) p.mood = Math.min(MOOD_MAX, p.mood + 1);
};
const moodDown = (p) => {
  if (p && p.mood > 0) p.mood -= 1;
};
const take = (game, key, n) => {
  const taken = Math.min(n, game.stock[key]);
  game.stock[key] -= taken;
  return taken;
};

export const NIGHT_EVENTS = [
  {
    id: 'insomnia',
    weight: 3,
    when: (game) => family(game).length > 0,
    run(game, rng) {
      const p = rng.pick(family(game));
      moodUp(p);
      return { text: `${josa(p.name, '은/는')} 밤새 뒤척이며 한숨도 자지 못했다.`, tone: 'warn' };
    },
  },
  {
    id: 'rats',
    weight: 2.5,
    when: (game) => game.stock.food > 0,
    run(game, rng) {
      if (game.flags.dog) return { text: '밤새 부스럭거리는 소리에 보리가 뛰쳐나갔다. 아침에 보니 쥐 한 마리를 물어다 놓았다. 선반은 무사했다.', tone: 'good', good: true };
      const lost = take(game, 'food', rng.int(1, 2));
      return { text: `밤새 부스럭거리더니, 아침에 보니 쥐가 ${josa(formatAmount('food', lost), '을/를')} 갉아 먹었다.`, tone: 'bad' };
    },
  },
  {
    id: 'rain',
    weight: 2,
    good: true,
    run(game, rng) {
      const got = rng.int(1, 2);
      game.stock.water += got;
      return { text: `밤새 비가 내렸다. 창틀에 받쳐 둔 냄비에 ${formatAmount('water', got)}만큼 고였다.`, tone: 'good' };
    },
  },
  {
    id: 'scratching',
    weight: 2,
    when: (game) => family(game).length > 0,
    run(game, rng) {
      moodUp(rng.pick(family(game)));
      return { text: '새벽 내내 무언가 현관문을 긁었다. 아무도 숨소리조차 내지 못했다.', tone: 'warn' };
    },
  },
  {
    id: 'deep_sleep',
    weight: 2,
    good: true,
    when: (game) => family(game).some((p) => p.mood > 0),
    run(game, rng) {
      const p = rng.pick(family(game).filter((q) => q.mood > 0));
      moodDown(p);
      return { text: `${josa(p.name, '은/는')} 오랜만에 깊이 잠들었다. 아침 얼굴이 한결 편해 보인다.`, tone: 'good' };
    },
  },
  {
    id: 'damp',
    weight: 1.2,
    when: (game) => game.stock.med > 0,
    run(game) {
      take(game, 'med', 1);
      return { text: '밤새 습기가 차 구급약 하나가 곰팡이로 못 쓰게 됐다.', tone: 'bad' };
    },
  },
  {
    id: 'stars',
    weight: 1.5,
    good: true,
    when: (game) => family(game).length > 0,
    run(game) {
      for (const p of family(game)) moodDown(p);
      return { text: '정전된 도시 위로 별이 쏟아졌다. 창가에 모여 한참 하늘을 올려다봤다.', tone: 'good' };
    },
  },
  {
    id: 'gunfire',
    weight: 1.5,
    when: (game) => family(game).length > 0,
    run(game, rng) {
      moodUp(rng.pick(family(game)));
      return { text: '멀리서 총성이 밤새 이어지다 뚝 끊겼다.', tone: 'warn' };
    },
  },
  {
    id: 'snoring',
    weight: 1,
    good: true,
    when: (game) => game.person('dad').status === 'home' && family(game).length > 1,
    run(game, rng) {
      moodDown(rng.pick(family(game).filter((p) => p.id !== 'dad')));
      return { text: '아빠의 코 고는 소리에 다들 잠을 설쳤지만, 아침에는 그 얘기로 한바탕 웃었다.', tone: 'good' };
    },
  },
  {
    id: 'dog_growl',
    weight: 1,
    when: (game) => game.flags.dog && family(game).length > 0,
    run(game, rng) {
      moodUp(rng.pick(family(game)));
      return { text: '보리가 밤새 창밖을 보며 낮게 으르렁댔다. 무엇을 본 걸까. 다들 잠을 설쳤다.', tone: 'warn' };
    },
  },
  {
    id: 'night_fever',
    weight: 0.8,
    when: (game) => family(game).some((p) => p.health === 0),
    run(game, rng) {
      const p = rng.pick(family(game).filter((q) => q.health === 0));
      if (!rng.chance(0.5 * game.difficulty.harm)) return { text: `${josa(p.name, '이/가')} 밤새 식은땀을 흘렸지만, 아침에는 열이 내렸다.`, tone: '' };
      p.health = 1;
      return { text: `${josa(p.name, '이/가')} 밤새 열에 시달렸다. 아침에도 일어나지 못한다.`, tone: 'bad' };
    },
  },
  // ── 아포칼립스에서만 ─────────────────────────
  {
    id: 'blood_moon',
    weight: 2,
    apocalypse: true,
    run(game, rng) {
      for (const p of family(game)) if (rng.chance(0.5)) moodUp(p);
      return { text: '붉은 달이 떴다. 좀비들의 울음이 밤새 그치지 않았다.', tone: 'bad' };
    },
  },
  {
    id: 'roof_steps',
    weight: 1.5,
    apocalypse: true,
    when: (game) => game.stock.food >= CAN,
    run(game) {
      take(game, 'food', CAN);
      return { text: '무언가 지붕 위를 오갔다. 아침에 보니 환기구 덮개가 뜯겨 있고 통조림 하나가 사라졌다.', tone: 'bad' };
    },
  },
  {
    id: 'tainted_water',
    weight: 1.5,
    apocalypse: true,
    when: (game) => game.stock.water >= CAN,
    run(game) {
      const lost = take(game, 'water', Math.ceil(game.stock.water * 0.25));
      return { text: `물병 몇 개가 밤사이 뿌옇게 변했다. 오염된 ${josa(formatAmount('water', lost), '을/를')} 버릴 수밖에 없었다.`, tone: 'bad' };
    },
  },
];

/** 오늘 밤 일어날 수 있는 밤사이 사건 목록 */
export function eligibleNightEvents(game) {
  return NIGHT_EVENTS.filter((def) => {
    if (def.apocalypse && game.difficulty.id !== 'apocalypse') return false;
    const last = game.nightHistory[def.id];
    if (last != null && game.day - last < 3) return false; // 같은 일은 사흘 안에 되풀이되지 않는다
    return !def.when || def.when(game);
  });
}

/**
 * 밤사이 사건을 굴린다. 일어나면 { id, text, tone } 를 돌려준다.
 * 난이도가 높을수록 나쁜 일의 비중이 커진다.
 */
export function rollNightEvent(game, rng) {
  const chance = NIGHT_EVENT_CHANCE[game.difficulty.id] ?? 0.45;
  if (!rng.chance(chance)) return null;
  const list = eligibleNightEvents(game);
  if (!list.length) return null;
  const harm = game.difficulty.harm;
  const def = rng.weighted(list, (d) => d.weight * (d.good ? 1 / harm : harm));
  game.nightHistory[def.id] = game.day;
  const result = def.run(game, rng);
  return { id: def.id, ...result };
}
