// 테스트용으로 실제 흐름(첫 보급 → 귀가 → 가족 선택)을 거쳐 집 생존 단계의 게임을 만든다.
import { SIM_STEP } from '../../src/core/constants.js';
import { Game } from '../../src/core/game.js';
import { HOME_ZONE } from '../../src/core/world.js';

/** 첫 보급에서 플레이어를 집 앞으로 옮겨 곧바로 귀가시킨다. */
export function arriveHome(game) {
  game.run.player.x = HOME_ZONE.x + HOME_ZONE.w / 2;
  game.run.player.y = HOME_ZONE.y + HOME_ZONE.h / 2;
  game.stepRun(SIM_STEP, {});
}

export function homeGame({ seed = 1, bring = ['dad', 'mom', 'sis'], stock = {}, zombies = false } = {}) {
  const game = new Game({ seed, zombies });
  game.startFirstRun();
  arriveHome(game);
  while (game.phase === 'family') {
    const c = game.familyCandidate();
    game.decideFamily(c.id, bring.includes(c.id));
  }
  Object.assign(game.stock, stock);
  game.syncRations();
  return game;
}

/** 오늘 사건이 있으면 항상 가능한 마지막 선택지(거절·버티기 류)로 넘긴다. */
export function resolveAnyEvent(game) {
  if (!game.event || game.event.resolved) return;
  const enabled = game.eventView().options.filter((o) => !o.disabled);
  game.chooseOption(enabled[enabled.length - 1].id);
}
