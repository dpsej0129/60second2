export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 조건이 참일 때만 문자열을 넣는다. 조건이 거짓일 때 계산하면 안 되는 내용은 함수로 넘긴다. */
export const when = (cond, html) => (cond ? (typeof html === 'function' ? html() : html) : '');
