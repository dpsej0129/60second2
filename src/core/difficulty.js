// 난이도. 시작 화면에서 고른다.
//   run          80초 탐색의 좀비 수·속도·시야
//   expedition   탐사 위험 배수(risk), 들고 오는 칸 수(capacity), 길에서 줍는 식량·물 개수(found),
//                떠난 뒤 며칠 만에 돌아오는지(days: [최소, 최대], 그 사이 무작위)
//   harm         사건에서 나쁜 결과가 나올 확률 배수
//   worsenDays   치료하지 않은 부상이 악화되는 일수
//   eventChance  예정된 사건이 없는 날 무작위 사건이 일어날 확률
export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: '이지',
    blurb: '좀비가 적고 느리다. 탐사가 덜 위험하고 더 많이 들고 오며, 사나흘이면 돌아온다.',
    run: { martZombies: 1, streetZombies: 1, spawnInterval: 14, maxZombies: 4, speedMin: 32, speedMax: 48, sight: 165 },
    expedition: { risk: 0.6, capacity: 5, found: [1, 4], days: [3, 5] },
    harm: 0.7,
    worsenDays: 5,
    eventChance: 0.45,
  },
  hard: {
    id: 'hard',
    name: '하드',
    blurb: '좀비가 늘고 빨라진다. 탐사는 일주일 가까이 걸리고, 다치거나 돌아오지 못하는 일이 잦다.',
    run: { martZombies: 2, streetZombies: 2, spawnInterval: 9, maxZombies: 8, speedMin: 44, speedMax: 66, sight: 220 },
    expedition: { risk: 1, capacity: 4, found: [0, 3], days: [4, 7] },
    harm: 1,
    worsenDays: 4,
    eventChance: 0.45,
  },
  apocalypse: {
    id: 'apocalypse',
    name: '아포칼립스',
    blurb: '거리가 좀비로 가득하다. 탐사는 열흘 가까이 걸리는 목숨을 건 도박이고, 상처는 금세 덧난다.',
    run: { martZombies: 3, streetZombies: 3, spawnInterval: 7, maxZombies: 11, speedMin: 50, speedMax: 74, sight: 245 },
    expedition: { risk: 1.35, capacity: 3, found: [1, 3], days: [5, 9] },
    harm: 1.35,
    worsenDays: 3,
    eventChance: 0.55,
  },
};

export const DIFFICULTY_ORDER = ['easy', 'hard', 'apocalypse'];
export const DEFAULT_DIFFICULTY = 'easy';

export function difficultyOf(id) {
  return DIFFICULTIES[id] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
}
