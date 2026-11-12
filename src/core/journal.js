// 일지: 60 Seconds!의 공책처럼, 하루를 일기 문장으로 적는다.
// - 아침마다 한 쪽을 새로 쓴다: 지난 쪽 이후에 일어난 일(어제의 사건과 대응, 밤사이 식사, 탐사 소식)
//   + 오늘 아침 식구들의 모습 + 선반에 남은 것.
// - 수치·확률·탈출 조건은 적지 않는다. 보이는 것과 들리는 것만 적는다.
import {
  HEALTH_CRITICAL,
  HUNGER_NOTICE,
  HUNGER_WEAK,
  MOOD_BROKEN,
  MOOD_DEPRESSED,
  MOOD_LOW,
  THIRST_NOTICE,
  THIRST_WEAK,
} from './constants.js';
import { ITEMS, RESOURCES, formatAmount } from './items.js';
import { josa } from './text.js';

/** ['나', '엄마', '동생'] → '나, 엄마와 동생' */
export function nameList(names) {
  if (names.length <= 1) return names[0] ?? '';
  const head = names.slice(0, -1);
  const last = head.pop();
  return [...head, josa(last, '과/와')].join(', ') + ' ' + names[names.length - 1];
}

/** 같은 날 같은 사람에게는 항상 같은 문장을 고른다(다시 그려도 바뀌지 않게). */
function pick(list, ...keys) {
  let h = 7;
  for (const k of keys) for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

const OPENING = [
  (d) => `${d}일째 아침이 밝았다.`,
  (d) => `문을 걸어 잠근 지 ${d}일째.`,
  (d) => `오늘로 ${d}일째다.`,
  (d) => `벌써 ${d}일째. 바깥은 여전히 조용하지 않다.`,
  (d) => `${d}일째. 날짜를 세는 것도 일이 되었다.`,
];

const FINE_SELF = ['아직은 버틸 만하다', '정신을 단단히 붙잡고 있다', '그럭저럭 괜찮다'];
const FINE_OTHER = ['그럭저럭 괜찮아 보인다', '생각보다 씩씩하다', '조용히 제 할 일을 한다', '아직은 버틸 만하다고 한다'];

/** 사람 한 명의 아침 모습: 연결형(-고)과 끝맺음형(-다)을 함께 둔다. */
function conditions(p) {
  const parts = [];
  if (p.health >= HEALTH_CRITICAL) parts.push(['크게 다쳐 일어나지 못하고', '크게 다쳐 일어나지 못한다', 'bad']);
  else if (p.health === 1) parts.push(['다친 곳이 욱신거리고', '다친 곳이 욱신거린다', 'warn']);
  if (p.thirst >= THIRST_WEAK) parts.push(['목이 바싹 타들어 가고', '목이 바싹 타들어 간다', 'bad']);
  else if (p.thirst >= THIRST_NOTICE) parts.push(['목이 마르고', '목이 마르다', 'warn']);
  if (p.hunger >= HUNGER_WEAK) parts.push(['굶주려 기운이 없고', '굶주려 기운이 없다', 'bad']);
  else if (p.hunger >= HUNGER_NOTICE) parts.push(['배가 고프고', '배가 고프다', 'warn']);
  const mood = p.mood ?? 0;
  if (mood >= MOOD_BROKEN) parts.push(['아무도 없는 쪽을 보며 중얼거리고', '아무도 없는 쪽을 보며 중얼거린다', 'bad']);
  else if (mood >= MOOD_DEPRESSED) parts.push(['구석에 웅크린 채 아무것도 하려 하지 않고', '구석에 웅크린 채 아무것도 하려 하지 않는다', 'bad']);
  else if (mood >= MOOD_LOW) parts.push(['말수가 부쩍 줄었고', '말수가 부쩍 줄었다', 'warn']);
  else if (mood === 1) parts.push(['조금 지쳐 보이고', '조금 지쳐 보인다', '']);
  return parts;
}

export function personLine(p, day) {
  const subject = p.isPlayer ? '나는' : josa(p.name, '은/는');
  const parts = conditions(p);
  if (!parts.length) {
    return { text: `${subject} ${pick(p.isPlayer ? FINE_SELF : FINE_OTHER, day, p.id)}.`, tone: '', person: p.id };
  }
  const body = parts.map((part, i) => (i === parts.length - 1 ? part[1] : part[0])).join(' ');
  const tone = parts.some((x) => x[2] === 'bad') ? 'bad' : parts.some((x) => x[2] === 'warn') ? 'warn' : '';
  return { text: `${subject} ${body}.`, tone, person: p.id };
}

/** 선반 위에 남은 것(수치 대신 캔·병 단위로). */
export function shelfLine(stock) {
  const have = Object.entries(RESOURCES)
    .filter(([key]) => stock[key] > 0)
    .map(([key, res]) => (res.portions ? formatAmount(key, stock[key]) : `${res.name} ${stock[key]}${res.unit}`));
  const lines = [];
  if (!have.length) lines.push({ text: '선반이 텅 비었다.', tone: 'bad' });
  else lines.push({ text: `선반에 남은 것: ${have.join(', ')}.`, tone: '' });
  if (stock.food <= 0 && stock.water <= 0) {
    if (have.length) lines.push({ text: '먹을 것도 마실 것도 다 떨어졌다.', tone: 'bad' });
  } else if (stock.food <= 0) lines.push({ text: '통조림이 다 떨어졌다.', tone: 'bad' });
  else if (stock.water <= 0) lines.push({ text: '물이 한 방울도 남지 않았다.', tone: 'bad' });
  return lines;
}

/** 오늘 아침의 모습: 여는 말, 식구들, 집을 비운 사람, 선반. */
export function morningStatus(game) {
  const lines = [];
  const day = game.day;
  lines.push({ text: day === 1 ? '집에 돌아온 첫날이다. 문과 창을 판자로 막았다.' : pick(OPENING, day)(day), tone: 'open' });
  const present = game.presentPeople();
  for (const p of present) lines.push(personLine(p, day));
  const exp = game.expedition;
  if (exp) {
    const who = game.person(exp.memberId);
    const days = day - exp.departDay;
    lines.push({
      text: days <= 1 ? `${josa(who.name, '은/는')} 물자를 구하러 나가 있다.` : `${josa(who.name, '이/가')} 탐사를 나간 지 ${days}일째. 아직 소식이 없다.`,
      tone: days >= 3 ? 'warn' : '',
    });
  }
  if (day === 1) {
    for (const p of game.people.filter((x) => x.status === 'left')) {
      lines.push({ text: `${josa(p.name, '을/를')} 끝내 데려오지 못했다. 어딘가에서 무사하기를 빈다.`, tone: 'warn' });
    }
  }
  if (game.flags.dog) lines.push({ text: pick(['보리가 문가에 엎드려 귀를 세우고 있다.', '보리가 꼬리를 흔들며 식구들 사이를 오간다.'], day), tone: 'good' });
  if (present.length === 1 && present[0].isPlayer && day > 1) lines.push({ text: '집 안이 너무 조용하다.', tone: 'warn' });
  lines.push(...shelfLine(game.stock));
  return lines;
}

/** 60초 탐색에서 들고 온 것: '통조림 3개, 생수 2개' */
export function itemSummary(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${ITEMS[id].name} ${n}개`).join(', ');
}

/**
 * 밤사이 식사를 일기 문장으로: 누가 무엇을 얼마나 나눠 먹었는지, 누가 굶었는지.
 * ate/drank: 먹은(마신) 사람 이름, used: 소비한 분량(1 = ¼캔·¼병)
 */
export function mealLines({ present, ate, drank, usedFood, usedWater, unfed, unwatered }) {
  const lines = [];
  const everyone = present.length > 1;
  const who = (names) => (everyone && names.length === present.length ? '다 같이' : josa(nameList(names), '이/가'));
  const share = (names) => (names.length > 1 ? '나눠 ' : '');
  const food = formatAmount('food', usedFood);
  const water = formatAmount('water', usedWater);
  if (!ate.length && !drank.length) {
    lines.push(
      unfed.length || unwatered.length
        ? { text: '어젯밤에는 아무도 먹지도 마시지도 못했다.', tone: 'warn' }
        : { text: '어젯밤은 아무것도 꺼내지 않고 아껴 두었다.', tone: '' },
    );
  } else if (ate.length && drank.length && ate.join() === drank.join()) {
    lines.push({ text: `저녁에 ${who(ate)} ${josa(food, '과/와')} ${josa(water, '을/를')} ${share(ate)}먹었다.`, tone: '' });
  } else {
    if (ate.length) lines.push({ text: `저녁에 ${who(ate)} ${josa(food, '을/를')} ${share(ate)}먹었다.`, tone: '' });
    if (drank.length) {
      const amount = ate.length ? water.replace(/^물 /, '') : water;
      lines.push({ text: `${ate.length ? '물은 ' : '저녁에 '}${who(drank)} ${josa(amount, '을/를')} ${share(drank)}마셨다.`, tone: '' });
    }
  }
  if (unwatered.length) lines.push({ text: `${josa(nameList(unwatered), '은/는')} 목이 말랐지만 물을 마시지 못했다.`, tone: 'bad' });
  if (unfed.length) lines.push({ text: `${josa(nameList(unfed), '은/는')} 배가 고팠지만 아무것도 먹지 못했다.`, tone: 'bad' });
  return lines;
}
