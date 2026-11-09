// 주인공과 집 주변에 흩어진 가족 3명.
import {
  HEALTH_CRITICAL,
  HEALTH_DEATH,
  HUNGER_DEATH,
  HUNGER_WEAK,
  THIRST_DEATH,
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
    where: '집 앞 골목, 주차된 트럭 밑에 숨어 있다.',
    perk: '좀비 습격·약탈자 사건에서 문을 지킨다. 생존자 집단과 교섭할 때 더 나은 조건을 끌어낸다.',
  },
  {
    id: 'mom',
    name: '엄마',
    role: '간호사',
    trait: 'medic',
    color: '#7fc8a9',
    initialHealth: 0,
    where: '옆집 담벼락 뒤에 몸을 낮추고 있다.',
    perk: '하루 한 번 부상자를 간호해 악화를 막는다. 구급약 없이 응급처치하거나 다른 생존자를 치료할 수 있다.',
  },
  {
    id: 'sis',
    name: '동생',
    role: '무선 동아리 부원',
    trait: 'mechanic',
    color: '#b59cff',
    initialHealth: 1,
    where: '놀이터 미끄럼틀 아래. 발목을 다쳐 혼자 움직이지 못한다.',
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
    // home: 집에 있음 / outside: 아직 데려올지 정하지 않음 / left: 두고 옴 / lost: 다시 만날 수 없음 / dead: 사망
    status,
    hunger: 0,
    thirst: 0,
    health: def.initialHealth ?? 0,
    untreated: 0,
    treatedToday: false,
    cause: null,
  };
}

export const isHome = (p) => p?.status === 'home';

/** 사건에서 몸을 써서 행동할 수 있는 상태인지 */
export function isCapable(p) {
  return isHome(p) && p.health < HEALTH_CRITICAL && p.hunger < HUNGER_WEAK && p.thirst < THIRST_WEAK;
}

export function incapableReason(p) {
  if (!p || p.status !== 'home') return '집에 없다';
  if (p.health >= HEALTH_CRITICAL) return '중상으로 움직일 수 없다';
  if (p.hunger >= HUNGER_WEAK) return '굶주려 힘이 없다';
  if (p.thirst >= THIRST_WEAK) return '탈수로 정신이 흐릿하다';
  return null;
}

export function hungerLabel(h) {
  if (h <= 0) return { text: '배부름', tone: 'ok' };
  if (h === 1) return { text: '괜찮음', tone: 'ok' };
  if (h < HUNGER_WEAK) return { text: '배고픔', tone: 'warn' };
  if (h < HUNGER_DEATH) return { text: '굶주림', tone: 'bad' };
  return { text: '아사', tone: 'bad' };
}

export function thirstLabel(t) {
  if (t <= 0) return { text: '갈증 없음', tone: 'ok' };
  if (t === 1) return { text: '목마름', tone: 'warn' };
  if (t < THIRST_WEAK) return { text: '심한 갈증', tone: 'warn' };
  if (t < THIRST_DEATH) return { text: '탈수', tone: 'bad' };
  return { text: '탈수사', tone: 'bad' };
}

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
