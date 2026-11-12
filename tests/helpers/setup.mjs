// 테스트용으로 실제 60초 탐색 규칙을 거쳐 집 생존 단계의 게임을 만든다.
// (플레이어를 순간 이동시키는 것만 다르고, 줍기·가방·집에 들여놓기는 실제 규칙 그대로다.)
import { SIM_STEP } from '../../src/core/constants.js';
import { Game } from '../../src/core/game.js';
import { morningStatus } from '../../src/core/journal.js';
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

/**
 * bring 에 있는 가족을 실제로 데려와 집 생존 1일차로 넘어간 게임.
 * bonus: false(기본)면 '덤으로 일어나는 미션 사건'을 꺼서 하루에 사건이 하나만 일어난다
 * (특정 사건의 조건을 따로 떼어 검사하기 위한 것. 덤 사건 자체는 events/missions 테스트에서 확인한다).
 */
export function homeGame({ seed = 1, bring = ['dad', 'mom', 'sis'], stock = {}, zombies = false, difficulty = 'hard', bonus = false } = {}) {
  const game = new Game({ seed, zombies, difficulty });
  if (!bonus) game.director.pickBonus = () => null;
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
  game.journal.at(-1).status = morningStatus(game); // 재고를 맞춘 뒤 첫 쪽의 아침 모습도 다시 적는다
  return game;
}

/** 오늘 사건이 있으면(이어지는 사건 포함) 항상 가능한 마지막 선택지(거절·버티기 류)로 넘긴다. */
export function resolveAnyEvent(game) {
  for (let i = 0; i < 5 && game.phase === 'home' && game.event && !game.event.resolved; i++) {
    const enabled = game.eventView().options.filter((o) => !o.disabled);
    game.chooseOption(enabled[enabled.length - 1].id);
  }
}

/** 다른 사건이 끼어들지 않게 한다: 무작위 사건을 없애고 탈출 경로를 끝난 것으로 둔다(미션만 떼어 검사할 때). */
export function isolate(game) {
  game.director.randomEvents = [];
  for (const chain of Object.values(game.director.chains)) {
    if (chain.kind === 'path') {
      chain.status = 'done';
      chain.due = null;
    }
  }
  return game;
}

/** 지정한 무작위 사건을 오늘의 사건으로 세운다(선택지 조건·결과 검사용). */
export function stageEvent(game, defId, params = {}) {
  game.event = { defId, chainId: null, day: game.day, params, resolved: false, outcome: null, choice: null };
  game.eventQueue = [];
  return game.eventView();
}

/** 미션(또는 경로)의 예약된 다음 단계가 일어나는 날까지 하루씩 넘긴다. */
export function untilChainEvent(game, chainId, maxDays = 12) {
  for (let i = 0; i < maxDays && game.phase === 'home'; i++) {
    if (game.event?.chainId === chainId && !game.event.resolved) return game.eventView();
    resolveAnyEvent(game);
    if (game.phase !== 'home') break;
    game.endDay();
  }
  return game.event?.chainId === chainId && !game.event.resolved ? game.eventView() : null;
}

/** n일 동안 사건은 아무 선택지로 넘기며 하루를 보낸다. */
export function passDays(game, n) {
  for (let i = 0; i < n && game.phase === 'home'; i++) {
    resolveAnyEvent(game);
    if (game.phase !== 'home') return;
    game.endDay();
  }
}
