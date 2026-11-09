import { CHAINS } from './chains.js';
import { RANDOM_EVENTS } from './random.js';

export { CHAINS, RANDOM_EVENTS };

/** 모든 사건 정의를 id로 찾을 수 있게 모은다. */
export const EVENT_DEFS = {};
for (const def of RANDOM_EVENTS) EVENT_DEFS[def.id] = { ...def, kind: 'random' };
for (const chain of CHAINS) {
  chain.stages.forEach((stage, index) => {
    EVENT_DEFS[stage.id] = { ...stage, kind: 'chain', chainId: chain.id, stage: index };
  });
}

export const CHAIN_DEFS = Object.fromEntries(CHAINS.map((c) => [c.id, c]));
