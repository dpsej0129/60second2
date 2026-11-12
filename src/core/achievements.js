// 업적: 한 판이 끝날 때(결말) 판정한다. 시작·결말 화면에 모아 보여 주고, 브라우저에만 저장한다.
import { PATHS } from './events/index.js';
import { ENDING_ORDER } from './endings.js';

const FAMILY = ['dad', 'mom', 'sis'];
const won = (g) => g.ending?.type === 'victory';
const familyHome = (g) => FAMILY.filter((id) => g.person(id).status === 'home');

/** 탈출 경로 하나가 마지막 단계만 남겨 둔 채였는지(탈출을 코앞에 두었는지) */
export function nearEscape(game) {
  return PATHS.some((def) => {
    const chain = game.director.chains[def.id];
    return chain.opened && !['done', 'failed'].includes(chain.status) && chain.stage === def.stages.length - 1;
  });
}

export const ACHIEVEMENTS = [
  {
    id: 'voices',
    icon: '🌀',
    title: '목소리를 따라서',
    desc: '환청과 망상(조현병 증상)에 시달리던 식구가 집을 나갔다',
    check: (g) => g.people.some((p) => /목소리를 따라/.test(p.fate ?? '')),
  },
  {
    id: 'so_close',
    icon: '🥀',
    title: '탈출 직전',
    desc: '탈출을 코앞에 두고 끝내 쓰러졌다',
    check: (g) => g.ending?.type === 'defeat' && g.day > 0 && nearEscape(g),
  },
  {
    id: 'first_day',
    icon: '⏱️',
    title: '80초도 버티지 못했다',
    desc: '처음 80초 안에 붙잡히거나 집에 들어가지 못했다',
    check: (g) => ['caught', 'timeout'].includes(g.ending?.id) && g.day === 0,
  },
  {
    id: 'together',
    icon: '👨‍👩‍👧',
    title: '모두 함께',
    desc: '가족 셋을 모두 데리고 탈출했다',
    check: (g) => won(g) && familyHome(g).length === FAMILY.length,
  },
  {
    id: 'alone',
    icon: '🧍',
    title: '홀로 살아남다',
    desc: '가족 없이 혼자 탈출했다',
    check: (g) => won(g) && familyHome(g).length === 0,
  },
  {
    id: 'good_boy',
    icon: '🐕',
    title: '좋은 친구',
    desc: '보리와 함께 탈출했다',
    check: (g) => won(g) && g.flags.dog,
  },
  {
    id: 'hard_win',
    icon: '🛡️',
    title: '하드 생존자',
    desc: '하드 난이도에서 탈출했다',
    check: (g) => won(g) && g.difficulty.id === 'hard',
  },
  {
    id: 'apocalypse_win',
    icon: '☢️',
    title: '종말의 생존자',
    desc: '아포칼립스 난이도에서 탈출했다',
    check: (g) => won(g) && g.difficulty.id === 'apocalypse',
  },
  {
    id: 'hundred',
    icon: '📅',
    title: '백일',
    desc: '100일째 아침을 맞았다',
    check: (g) => g.day >= 100,
  },
  {
    id: 'hoarder',
    icon: '🛒',
    title: '싹쓸이',
    desc: '처음 80초 동안 물품 12개 이상을 집에 들였다',
    check: (g) => (g.firstRun?.items.length ?? 0) >= 12,
  },
  {
    id: 'mover',
    icon: '📦',
    title: '이삿날',
    desc: '좀비가 들끓는 거리를 건너 새 은신처로 옮겼다',
    check: (g) => g.moves > 0,
  },
  {
    id: 'tireless',
    icon: '🥾',
    title: '쉼 없는 발걸음',
    desc: '쉬지 않고 탐사를 네 번 연달아 보냈다',
    check: (g) => g.stats.maxStreak >= 4,
  },
  {
    id: 'explorer',
    icon: '🧭',
    title: '탐사 대장',
    desc: '한 판에 탐사를 20번 보냈다',
    check: (g) => g.expeditions >= 20,
  },
  {
    id: 'listener',
    icon: '💬',
    title: '들어 주는 사람',
    desc: '한 판에 식구와 이야기를 20번 나눴다',
    check: (g) => g.stats.talks >= 20,
  },
  {
    id: 'dj_fan',
    icon: '📻',
    title: '애청자',
    desc: '좀비 FM의 비밀 창고를 찾아냈다',
    check: (g) => g.director.chains.dj?.status === 'done',
  },
  {
    id: 'collector',
    icon: '📖',
    title: '모든 결말',
    desc: `결말 ${ENDING_ORDER.length}가지를 모두 보았다`,
    check: (g, { discovered = [] } = {}) => ENDING_ORDER.every((id) => discovered.includes(id) || g.ending?.id === id),
  },
];

/** 이번 판에서 이룬 업적 id 목록. context.discovered: 지금까지 본 결말(도감) */
export function earnedAchievements(game, context = {}) {
  if (!game.ending) return [];
  return ACHIEVEMENTS.filter((a) => a.check(game, context)).map((a) => a.id);
}
