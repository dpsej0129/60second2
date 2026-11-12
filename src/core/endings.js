// 결말. type: victory(탈출) · odd(기묘한 결말: 이긴 것도 진 것도 아니다) · defeat
// 조건은 화면에 나오지 않는다. 결말 도감에는 한 번 본 결말의 제목만 남는다.
export const ENDINGS = {
  rescue: {
    type: 'victory',
    icon: '🚁',
    title: '구조 헬기 탈출',
    text: '헬기가 연기 자욱한 도시 위로 떠올랐다. 창밖으로 마트 지붕이 점점 작아진다. 살아남았다.',
  },
  group: {
    type: 'victory',
    icon: '🏚️',
    title: '강변 거점 합류',
    text: '트럭 짐칸에 몸을 싣고 강변 물류창고로 향했다. 높은 담장 안에서, 오랜만에 깊은 잠을 잤다.',
  },
  car: {
    type: 'victory',
    icon: '🚐',
    title: '승합차 탈출',
    text: '낡은 승합차가 좀비 떼를 뚫고 고속도로에 올랐다. 길 끝에 무엇이 있을지는 모르지만, 도시는 등 뒤로 멀어졌다.',
  },
  safezone: {
    type: 'victory',
    icon: '🚶',
    title: '남쪽 안전지대',
    text: '사흘을 걸었다. 저수지 둑 너머로 철조망과 감시탑이 보였을 때, 다리에 힘이 풀려 주저앉았다. 군인이 물병을 건네며 말했다. "어서 와요. 여기는 안전합니다."',
  },
  caravan: {
    type: 'victory',
    icon: '🛻',
    title: '떠돌이 상인 캐러밴',
    text: '철판을 덧댄 트럭이 도시를 빠져나갔다. 이제 우리는 마을과 마을 사이를 떠도는 상인이다. 집은 없지만, 갈 곳은 많다.',
  },
  cult: {
    type: 'odd',
    icon: '🕯️',
    title: '하얀 정원',
    text: '하얀 옷을 입고 노래를 따라 걸었다. 정원에서는 아무도 굶지 않았고, 아무도 바깥 일을 묻지 않았다. 가끔 예전 이름이 기억나지 않는다.',
  },
  raiders: {
    type: 'defeat',
    icon: '🏴',
    title: '빼앗긴 집',
    text: '약탈자들이 우리 집을 차지했다. 우리는 맨손으로 어두운 거리에 내몰렸다. 그 뒤의 일은 아무도 모른다.',
  },
  madness: {
    type: 'defeat',
    icon: '🌑',
    title: '홀로 남은 집',
    text: '벽에 그려 둔 가족의 얼굴이 대답하기 시작했다. 나는 더 이상 문을 잠그지 않는다. 다들 곧 돌아올 테니까.',
  },
  died: {
    type: 'defeat',
    icon: '🪦',
    title: '끝내 쓰러졌다',
    text: '집 안에서 버티던 날들이 끝났다.',
  },
  lost: {
    type: 'defeat',
    icon: '🧭',
    title: '돌아오지 못한 탐사',
    text: '물자를 찾아 떠난 뒤 다시는 집 문을 두드리지 못했다. 남은 가족은 끝내 소식을 듣지 못했다.',
  },
  caught: {
    type: 'defeat',
    icon: '🧟',
    title: '좀비에게 붙잡혔다',
    text: '썩은 손이 어깨를 움켜쥐었다. 챙긴 물자가 바닥에 흩어진다.',
  },
  timeout: {
    type: 'defeat',
    icon: '⏱️',
    title: '시간 초과',
    text: '60초가 끝났을 때 집 밖에 있었다. 사방에서 몰려든 좀비 떼에 길이 막혔다.',
  },
};

/** 결말 도감에 늘어놓는 순서 */
export const ENDING_ORDER = Object.keys(ENDINGS);

// 결말 뒤 식구마다 한 줄씩(60 Seconds!의 결말 화면처럼). 탈출·기묘한 결말에서 함께 떠난 사람.
const EPILOGUES = {
  rescue: {
    dad: '피난민 캠프에서 경비대에 자원했다.',
    mom: '캠프 의무실에서 다시 간호복을 입었다.',
    sis: '통신병들 틈에서 무전기 다루는 법을 배우고 있다.',
    dog: '구조대원들의 마스코트가 되었다.',
  },
  group: {
    dad: '거점 담장 위에서 밤 경계를 맡았다.',
    mom: '창고 한쪽에 작은 진료소를 차렸다.',
    sis: '거점의 낡은 발전기를 고쳐 하루아침에 유명해졌다.',
    dog: '창고 마당을 뛰어다니며 쥐를 쫓는다.',
  },
  car: {
    dad: '운전대를 놓지 않고 밤새 달렸다.',
    mom: '뒷좌석에서 손전등으로 지도를 읽었다.',
    sis: '라디오 주파수를 돌리며 다른 생존자를 찾았다.',
    dog: '창밖으로 고개를 내밀고 바람을 맞았다.',
  },
  safezone: {
    dad: '피난 행렬의 맨 앞에서 길을 열었다.',
    mom: '지친 피난민들의 발을 붕대로 감아 주었다.',
    sis: '안전지대 입구에서 받은 사탕을 아껴 먹고 있다.',
    dog: '철조망 앞에서 군견과 코를 맞댔다.',
  },
  caravan: {
    dad: '짐칸에서 상인들의 물건을 지킨다.',
    mom: '마을에 들를 때마다 아픈 사람을 돌본다.',
    sis: '상인 대장의 정비 조수가 되었다.',
    dog: '트럭 조수석을 차지했다.',
  },
  cult: {
    dad: '하얀 옷을 입은 뒤로 더는 문을 지키지 않는다.',
    mom: '가끔 우리가 누구였는지 묻는다.',
    sis: '정원의 노래를 누구보다 먼저 외웠다.',
    dog: '정원 문 앞에서 한참 짖다가 어디론가 사라졌다.',
  },
};

/**
 * 결말 화면의 식구별 후일담: [{ id, name, text, tone }]
 * 함께 떠났거나 끝까지 곁에 있었던 사람, 먼저 떠나보낸 사람, 데려오지 못한 사람 모두 한 줄씩.
 */
export function epilogue(game) {
  const ending = game.ending;
  if (!ending) return [];
  const departed = ending.type !== 'defeat';
  const lines = [];
  for (const p of game.people) {
    if (p.isPlayer) continue;
    let text;
    let tone = '';
    if (p.status === 'home') {
      if (departed) {
        text = EPILOGUES[ending.id]?.[p.id] ?? '함께 떠났다.';
        tone = ending.type === 'victory' ? 'good' : '';
      } else {
        text = ending.id === 'died' || ending.id === 'madness' ? '홀로 남겨졌다.' : '끝까지 곁에 있었다.';
      }
    } else {
      text = p.fate ?? '다시 만나지 못했다.';
      tone = 'bad';
    }
    lines.push({ id: p.id, name: p.name, text, tone });
  }
  if (game.flags.dog) {
    lines.push({
      id: 'dog',
      name: '보리',
      text: departed ? (EPILOGUES[ending.id]?.dog ?? '꼬리를 흔들며 따라왔다.') : '마지막까지 문가를 지켰다.',
      tone: ending.type === 'victory' ? 'good' : '',
    });
  }
  return lines;
}
