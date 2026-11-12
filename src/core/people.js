// 주인공과 집 주변에 흩어진 가족 3명.
import {
  HEALTH_CRITICAL,
  HEALTH_DEATH,
  HUNGER_DEATH,
  HUNGER_NOTICE,
  MOOD_BROKEN,
  MOOD_DEPRESSED,
  MOOD_LOW,
  HUNGER_WEAK,
  THIRST_DEATH,
  THIRST_NOTICE,
  THIRST_WEAK,
} from './constants.js';

export const PLAYER_DEF = {
  id: 'me',
  name: '나',
  role: '주인공',
  trait: null,
  color: '#4ea1ff',
  perk: '마트로 보급을 나간다. 내가 쓰러지면 모든 것이 끝난다.',
};

export const FAMILY_DEFS = [
  {
    id: 'dad',
    name: '아빠',
    role: '전직 경비원',
    trait: 'guard',
    color: '#e0a458',
    initialHealth: 0,
    slots: 3,
    carryNote: '덩치가 커서 3칸을 차지한다',
    where: '집 북쪽 골목, 버려진 트럭 뒤에 숨어 있다.',
    perk: '좀비 습격·약탈자 사건에서 문을 지킨다. 생존자 집단과 교섭할 때 더 나은 조건을 끌어낸다. 탐사에 강하다.',
  },
  {
    id: 'mom',
    name: '엄마',
    role: '간호사',
    trait: 'medic',
    color: '#7fc8a9',
    initialHealth: 0,
    slots: 2,
    carryNote: '2칸을 차지한다',
    where: '집 뒤편 담장 아래에 몸을 낮추고 있다.',
    perk: '하루 한 번 부상자를 간호해 악화를 막는다. 구급약 없이 응급처치하거나 다른 생존자를 치료할 수 있다.',
  },
  {
    id: 'sis',
    name: '동생',
    role: '무선 동아리 부원',
    trait: 'mechanic',
    color: '#b59cff',
    initialHealth: 1,
    slots: 2,
    carryNote: '발목을 다쳐 업어 와야 한다 · 2칸',
    where: '남쪽 놀이터 미끄럼틀 아래. 발목을 다쳐 혼자 움직이지 못한다.',
    perk: '무전기 없이도 라디오를 개조해 교신하고, 엔진을 고칠 수 있다. 다만 다친 상태라 구급약이 필요하다.',
  },
];

export const PEOPLE_DEFS = [PLAYER_DEF, ...FAMILY_DEFS];

export function defOf(id) {
  return PEOPLE_DEFS.find((def) => def.id === id);
}

export function createPerson(def, status) {
  return {
    id: def.id,
    name: def.name,
    role: def.role,
    trait: def.trait,
    color: def.color,
    isPlayer: def.id === PLAYER_DEF.id,
    // home: 집에 있음 / outside: 60초 탐색 중 아직 집 밖 / left: 두고 옴 / away: 탐사 중
    // lost: 다시 만날 수 없음 / dead: 사망
    status,
    hunger: 0,
    thirst: 0,
    health: def.initialHealth ?? 0,
    untreated: 0,
    treatedToday: false,
    mood: 0, // 마음 상태(주인공은 혼자 남았을 때만 흔들린다)
    fate: null, // 집을 떠나거나 숨졌을 때의 사연(결말 후일담)
    talkedToday: false,
    cause: null,
  };
}

export const isHome = (p) => p?.status === 'home';

/** 사건에서 몸을 써서 행동할 수 있는 상태인지 */
export function isCapable(p) {
  return isHome(p) && p.health < HEALTH_CRITICAL && p.hunger < HUNGER_WEAK && p.thirst < THIRST_WEAK && p.mood < MOOD_DEPRESSED;
}

export function incapableReason(p) {
  if (!p || p.status !== 'home') return '집에 없다';
  if (p.health >= HEALTH_CRITICAL) return '중상으로 움직일 수 없다';
  if (p.hunger >= HUNGER_WEAK) return '굶주려 힘이 없다';
  if (p.thirst >= THIRST_WEAK) return '탈수로 정신이 흐릿하다';
  if (p.mood >= MOOD_DEPRESSED) return '깊은 우울에 빠져 아무것도 하려 하지 않는다';
  return null;
}

export function hungerLabel(h) {
  if (h <= 0) return { text: '배부름', tone: 'ok' };
  if (h < HUNGER_NOTICE) return { text: '괜찮음', tone: 'ok' };
  if (h < HUNGER_WEAK) return { text: '배고픔', tone: 'warn' };
  if (h < HUNGER_DEATH) return { text: '굶주림', tone: 'bad' };
  return { text: '아사', tone: 'bad' };
}

export function thirstLabel(t) {
  if (t <= 0) return { text: '갈증 없음', tone: 'ok' };
  if (t < THIRST_NOTICE) return { text: '괜찮음', tone: 'ok' };
  if (t < THIRST_WEAK - 1) return { text: '목마름', tone: 'warn' };
  if (t < THIRST_WEAK) return { text: '심한 갈증', tone: 'warn' };
  if (t < THIRST_DEATH) return { text: '탈수', tone: 'bad' };
  return { text: '탈수사', tone: 'bad' };
}

export function moodLabel(m) {
  if (m <= 0) return { text: '안정', tone: 'ok' };
  if (m === 1) return { text: '지침', tone: 'ok' };
  if (m === MOOD_LOW) return { text: '울적함', tone: 'warn' };
  if (m === MOOD_DEPRESSED) return { text: '우울함', tone: 'bad' };
  return { text: '환청·망상', tone: 'bad' };
}

export const MOOD_MAX = MOOD_BROKEN;

export const needsFood = (p) => p.hunger >= HUNGER_NOTICE;
export const needsWater = (p) => p.thirst >= THIRST_NOTICE;

export function healthLabel(h) {
  if (h <= 0) return { text: '건강', tone: 'ok' };
  if (h === 1) return { text: '부상', tone: 'warn' };
  if (h < HEALTH_DEATH) return { text: '중상', tone: 'bad' };
  return { text: '사망', tone: 'bad' };
}

/** 오늘 밤 그대로 두면 죽는지 (화면 경고용) */
export function deathRisk(p, { fed, watered }) {
  if (!fed && p.hunger + 1 >= HUNGER_DEATH) return '굶주림';
  if (!watered && p.thirst + 1 >= THIRST_DEATH) return '탈수';
  return null;
}
