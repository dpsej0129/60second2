// 다른 곳으로 옮겨 갈 기회. 고르면 실시간 이사 구간(제한 시간 안에 짐과 식구를 새 은신처로)이 시작된다.
export const PLACE_EVENTS = [
  {
    id: 'bunker_found',
    title: '공원 밑 방공호',
    weight: 1.6,
    minDay: 14,
    cooldown: 12,
    maxCount: 2,
    when: (game) => !game.flags.shelter,
    text: () =>
      '탐사에서 돌아오는 길에 본 것이 있다. 길 건너 공원 밑, 풀에 덮인 지하 방공호 철문이 열려 있었다. 안에는 물탱크와 이층 침대가 있고, 벽은 두꺼운 콘크리트다. 다만 옮기려면 좀비가 들끓는 거리를 몇 번이고 오가야 한다.',
    options: [
      {
        id: 'move',
        label: '오늘 당장 짐을 싸서 옮긴다',
        note: '정해진 시간 안에 옮기지 못한 짐과 식구는 두고 가야 한다',
        resolve(ctx) {
          ctx.move('bunker');
          return '배낭과 상자에 짐을 나눠 담고, 가구 위에 쌓아 두었다. 문을 열면 시간이 없다.';
        },
      },
      {
        id: 'stay',
        label: '정든 집에 남는다',
        resolve: () => '정든 집을 떠날 수 없었다. 방공호 문은 아마 한동안 열려 있을 것이다.',
      },
    ],
  },
];
