// 한국어 조사 처리: josa('아빠', '이/가') → '아빠가'

function hasBatchim(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export function josa(word, pair) {
  if (word === '나' && pair === '이/가') return '내가';
  const [withBatchim, withoutBatchim] = pair.split('/');
  return word + (hasBatchim(word) ? withBatchim : withoutBatchim);
}
