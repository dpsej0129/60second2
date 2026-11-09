// 테스트용으로 실제 60초 탐색 규칙을 거쳐 집 생존 단계의 게임을 만든다.
// (플레이어를 순간 이동시키는 것만 다르고, 줍기·가방·집에 들여놓기는 실제 규칙 그대로다.)
import { SIM_STEP } from '../../src/core/constants.js';
import { Game } from '../../src/core/game.js';
import { HOME_ZONE } from '../../src/core/world.js';

export const HOME_SPOT = { x: HOME_ZONE.x + HOME_ZONE.w / 2, y: HOME_ZONE.y + HOME_ZONE.h / 2 };

export function teleport(game, p) {
  game.run.player.x = p.x;
  game.run.player.y = p.y;
}

/** 지금 서 있는 곳에서 E를 눌러 줍고, 다 주울 때까지 기다린다. */
export function pickHere(game) {
  game.stepRun(SIM_STEP, { interact: true });
  for (let i = 0; i < 200 && game.run?.pickup; i++) game.stepRun(SIM_STEP, {});
}

/** 집 앞 도착 구역으로 옮겨 가방을 비운다(탐색은 계속된다). */
export function dropAtHome(game) {
  teleport(game, HOME_SPOT);
  game.stepRun(SIM_STEP, {});
}

/** 도착 구역에서 E: 문을 잠그고 들어간다(탐색 끝). */
export function enterHome(game) {
  teleport(game, HOME_SPOT);
  game.stepRun(SIM_STEP, {});
  game.stepRun(SIM_STEP, { interact: true });
}

/** bring 에 있는 가족을 실제로 데려와 집 생존 1일차로 넘어간 게임 */
export function homeGame({ seed = 1, bring = ['dad', 'mom', 'sis'], stock = {}, zombies = false } = {}) {
  const game = new Game({ seed, zombies });
  game.startFirstRun();
  for (const id of bring) {
    const spot = game.run.ground.find((g) => g.id === id);
    teleport(game, spot);
    pickHere(game);
    dropAtHome(game);
  }
  enterHome(game);
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

/** n일 동안 사건은 아무 선택지로 넘기며 하루를 보낸다. */
export function passDays(game, n) {
  for (let i = 0; i < n && game.phase === 'home'; i++) {
    resolveAnyEvent(game);
    if (game.phase !== 'home') return;
    game.endDay();
  }
}
