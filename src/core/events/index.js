import { CHAINS as PATHS } from './chains.js';
import { LIFE_EVENTS } from './life.js';
import { MISSIONS, MISSION_EVENTS } from './missions.js';
import { RANDOM_EVENTS as BASE_EVENTS } from './random.js';
import { VISITOR_EVENTS } from './visitors.js';
import { CRISIS_EVENTS } from './crises.js';
import { APOCALYPSE_EVENTS } from './apocalypse.js';
import { PLACE_EVENTS } from './places.js';

/** 탈출 경로(승리 조건)와 미션(곁가지 연쇄 사건)을 합친 전체 연쇄 사건 */
export const CHAINS = [...PATHS, ...MISSIONS];
/** 무작위로 일어나는 사건: 기본 사건 + 일상(마음·병·날씨) 사건 + 찾아오는 사람들 + 미션을 여는 사건·단발 미션 */
export const RANDOM_EVENTS = [
  ...BASE_EVENTS,
  ...LIFE_EVENTS,
  ...VISITOR_EVENTS,
  ...CRISIS_EVENTS,
  ...APOCALYPSE_EVENTS,
  ...PLACE_EVENTS,
  ...MISSION_EVENTS.map((def) => ({ ...def, bonus: true })),
];

export { MISSIONS, PATHS };

/** 모든 사건 정의를 id로 찾을 수 있게 모은다. */
export const EVENT_DEFS = {};
for (const def of RANDOM_EVENTS) EVENT_DEFS[def.id] = { ...def, kind: 'random' };
for (const chain of CHAINS) {
  chain.stages.forEach((stage, index) => {
    EVENT_DEFS[stage.id] = { ...stage, kind: 'chain', chainId: chain.id, stage: index };
  });
}

export const CHAIN_DEFS = Object.fromEntries(CHAINS.map((c) => [c.id, c]));
