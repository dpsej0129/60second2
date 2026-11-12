// 사건 선택지의 조건 검사 도우미. 검사 함수는 (game, params, chain) → null(가능) | 불가 사유 문자열.
import { formatAmount } from '../items.js';
import { defOf, incapableReason, isCapable } from '../people.js';
import { josa } from '../text.js';

export function needStock(key, n = 1) {
  return (game) => {
    const have = game.stock[key];
    if (have >= n) return null;
    return `${formatAmount(key, n)} 필요 (남은 것 ${formatAmount(key, have)})`;
  };
}

export function needCapable(id) {
  return (game) => {
    const p = game.person(id);
    if (!p || p.status !== 'home') return `${josa(defOf(id).name, '이/가')} 집에 없다`;
    const why = incapableReason(p);
    return why ? `${josa(p.name, '은/는')} ${why}` : null;
  };
}

export function allOf(...checks) {
  return (game, params, chain) => {
    for (const check of checks) {
      const reason = check(game, params, chain);
      if (reason) return reason;
    }
    return null;
  };
}

export const canTransmit = (game) =>
  game.stock.radio > 0 || isCapable(game.person('sis')) ? null : '무전기가 없고, 라디오를 개조할 동생도 없다';

export function criticalPeople(game) {
  return game.presentPeople().filter((p) => p.health >= 2);
}
