// 실시간 구간 밖의 화면들: 시작, 집 생존(하루 단위), 결말.
import { EXPEDITION_DAYS, HUNGER_DEATH, THIRST_DEATH } from '../core/constants.js';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_ORDER } from '../core/difficulty.js';
import { RESOURCES, portions } from '../core/items.js';
import {
  deathRisk,
  defOf,
  healthLabel,
  hungerLabel,
  incapableReason,
  moodLabel,
  needsFood,
  needsWater,
  thirstLabel,
} from '../core/people.js';
import { josa } from '../core/text.js';
import { esc, when } from './dom.js';
import { renderShelter } from './shelter.js';

// ── 시작 화면 ────────────────────────────────────

export function renderTitle({ seed, difficulty = DEFAULT_DIFFICULTY }) {
  const levels = DIFFICULTY_ORDER.map((id) => {
    const d = DIFFICULTIES[id];
    return `<label class="level ${id} ${id === difficulty ? 'on' : ''}">
        <input type="radio" name="difficulty" value="${id}" ${id === difficulty ? 'checked' : ''} />
        <span><b>${esc(d.name)}</b><small>${esc(d.blurb)}</small></span></label>`;
  }).join('');
  return `
    <section class="title-screen" data-screen="title">
      <p class="kicker">좀비 생존 게임</p>
      <h1>마트 탈출 <span>60초</span></h1>
      <p class="tagline">정전된 대형 마트, 몰려드는 좀비, 그리고 집 주변에 흩어진 가족.<br />
        60초 안에 내린 선택이 남은 날들을 결정한다.</p>
      <ol class="rules">
        <li><b>60초</b> — 마트와 집을 오가며 4칸 가방으로 물자를 나른다. 집 앞에 들어서면 가방이 비워지니 몇 번이고 다시 다녀올 수 있다. 60초가 끝날 때 집 앞에 있어야 산다.</li>
        <li><b>가족</b> — 집 주변에 흩어져 숨은 가족 3명도 칸을 차지한다. 물자와 가족 중 무엇을 먼저 옮길지 정하자.</li>
        <li><b>생존</b> — 통조림 한 캔, 물 한 병을 네 번에 나눠 먹으며 버틴다. 물자가 모자라면 한 명을 탐사로 내보낸다. 무엇을 들고 올지, 돌아오기는 할지 아무도 모른다.</li>
        <li><b>일지</b> — 하루하루가 공책에 적힌다. 버티기만 해서는 끝나지 않는다. 사건에 귀 기울이다 보면 언젠가 이곳을 벗어날 기회가 온다.</li>
      </ol>
      <form class="start-form" data-form="start">
        <fieldset class="levels">
          <legend>난이도</legend>
          ${levels}
        </fieldset>
        <div class="start-row">
          <label>시드 <input name="seed" inputmode="numeric" placeholder="비우면 무작위" value="${esc(seed ?? '')}" /></label>
          <button type="submit" class="btn primary big">게임 시작</button>
        </div>
      </form>
      <p class="muted small">조작: 이동 WASD·방향키(또는 화면을 누른 채 끌기) · 줍기 E/Space · 내려놓기 1~4</p>
    </section>`;
}

// ── 집 생존: 일지 ────────────────────────────────
// 60 Seconds!의 공책처럼 왼쪽 쪽에는 지난 하루를 정리한 일기, 오른쪽 쪽에는 오늘 할 일(사건·배급·탐사).
// 탈출 조건이나 확률은 어디에도 적지 않는다. 사건 속 이야기로만 알 수 있다.

function tag({ text, tone }) {
  return `<span class="tag ${tone}">${esc(text)}</span>`;
}

/** '... (건전지 -1)'처럼 문장 끝에 붙은 물자 증감은 작게 적는다. */
function prose(text) {
  const safe = esc(text);
  return safe.replace(/\s\(([^()]*[+-][^()]*)\)$/, ' <small class="delta">($1)</small>');
}

function entryHtml(e) {
  if (e.kind === 'event') return `<p class="entry event ${e.tone}"><b class="entry-title">${esc(e.title)}</b> ${prose(e.text)}</p>`;
  return `<p class="entry ${e.kind} ${e.tone}">${prose(e.text)}</p>`;
}

function diaryPage(game, ui) {
  const pages = game.journal;
  const page = pages.find((p) => p.day === ui.page) ?? pages[pages.length - 1];
  const idx = pages.indexOf(page);
  const isToday = idx === pages.length - 1 && page.day === game.day;
  const recap = page.entries.filter((e) => e.kind !== 'morning').map(entryHtml).join('');
  const news = page.entries.filter((e) => e.kind === 'morning').map(entryHtml).join('');
  const status = page.status.map((s) => `<p class="status ${s.tone}">${esc(s.text)}</p>`).join('');
  const later = isToday ? game.pendingEntries().map(entryHtml).join('') : '';
  const nav = (day, label, text) =>
    `<button type="button" class="page-turn" data-action="page" data-page="${day ?? ''}" aria-label="${label}" ${day == null ? 'disabled' : ''}>${text}</button>`;
  return `
    <article class="page diary" data-ref="diary" data-page="${page.day}">
      <header class="page-head">
        <h2 class="page-day">${page.day}일차</h2>
        <nav class="page-nav">
          ${nav(pages[idx - 1]?.day, '이전 쪽', '◀')}
          <span class="page-no">${idx + 1} / ${pages.length}쪽</span>
          ${nav(pages[idx + 1]?.day, '다음 쪽', '▶')}
        </nav>
      </header>
      ${when(recap, () => `<section class="diary-part" data-part="recap"><p class="diary-label">${page.day === 1 ? '60초' : '어제'}</p>${recap}</section>`)}
      <section class="diary-part" data-part="morning"><p class="diary-label">아침</p>${news}${status}</section>
      ${when(later, () => `<section class="diary-part" data-part="today"><p class="diary-label">오늘</p>${later}</section>`)}
      ${when(!isToday, () => `<button type="button" class="btn ghost small back-today" data-action="page" data-page="">오늘 쪽으로 돌아가기 →</button>`)}
      ${shelfSection(game)}
    </article>`;
}

function optionHtml(view, opt) {
  const chosen = view.resolved && view.choice === opt.id;
  const disabled = view.resolved || opt.disabled;
  const who = opt.who
    ? `<span class="who" style="--c:${defOf(opt.who).color}">${esc(defOf(opt.who).name)}</span>`
    : opt.tag
      ? `<span class="who" style="--c:#b8873a">${esc(opt.tag)}</span>`
      : '';
  const meta = [opt.cost ? `소모: ${esc(opt.cost)}` : '', opt.note ? esc(opt.note) : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="option ${chosen ? 'chosen' : ''}" data-action="choose" data-option="${opt.id}" ${disabled ? 'disabled' : ''}>
      <span class="box" aria-hidden="true">${chosen ? '✔' : ''}</span>
      <span class="option-body">
        <span class="option-label">${who}${esc(opt.label)}</span>
        ${when(meta, `<span class="option-meta">${meta}</span>`)}
        ${when(!view.resolved && opt.reason, `<span class="option-reason">${esc(opt.reason)}</span>`)}
      </span>
    </button>`;
}

function eventSection(game) {
  const earlier = game.resolvedToday
    .map(
      (v) => `<div class="event-card resolved earlier" data-event="${v.id}">
        <p class="kicker">먼저 일어난 일</p>
        <h3>${esc(v.title)}</h3>
        <p class="outcome">${prose(v.outcome)}</p>
      </div>`,
    )
    .join('');
  const view = game.eventView();
  if (!view) {
    return `
      <section class="today-part event-card quiet" data-ref="event">
        <p class="kicker">오늘의 일</p>
        <h3>조용한 하루</h3>
        <p class="event-text">${game.day === 1 ? '집에 돌아온 첫날. 문을 걸어 잠그고 숨을 돌렸다.' : '창밖으로 좀비 몇이 어슬렁거릴 뿐, 별일 없이 지나간다.'}</p>
      </section>`;
  }
  return `
    <section class="today-part">
      ${earlier}
      <div class="event-card ${view.resolved ? 'resolved' : 'pending'}" data-ref="event" data-event="${view.id}">
        <p class="kicker">${earlier ? '이어서 일어난 일' : '오늘의 일'}</p>
        <h3>${esc(view.title)}</h3>
        <p class="event-text">${esc(view.text)}</p>
        ${when(view.hint && !view.resolved, `<p class="event-hint">${esc(view.hint)}</p>`)}
        <div class="options">${view.options.map((opt) => optionHtml(view, opt)).join('')}</div>
        ${when(view.resolved, `<p class="outcome">${prose(view.outcome)}</p>`)}
      </div>
    </section>`;
}

const CAN_ICON = `<svg viewBox="0 0 16 20" aria-hidden="true"><rect x="2" y="3" width="12" height="15" rx="2" fill="#c96f3b" stroke="#3a2a1e" stroke-width="1.2"/><rect x="2" y="7" width="12" height="6" fill="#f1d9a8" stroke="#3a2a1e" stroke-width="0.8"/><ellipse cx="8" cy="3" rx="6" ry="1.6" fill="#d9d4c7" stroke="#3a2a1e" stroke-width="1"/></svg>`;
const BOTTLE_ICON = `<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M6 1h4v3l2 3v11a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 18V7l2-3z" fill="#9fd0f0" stroke="#24425a" stroke-width="1.2"/><rect x="6" y="1" width="4" height="2" fill="#2f6fa8"/><rect x="4.6" y="10" width="6.8" height="4" fill="#ffffffaa"/></svg>`;

function familySection(game) {
  const present = game.presentPeople();
  const rows = present
    .map((p) => {
      const r = game.rations[p.id] ?? { food: false, water: false };
      const risk = deathRisk(p, { fed: r.food, watered: r.water });
      const incapable = incapableReason(p);
      const medReason = game.medReason(p.id);
      const momReason = game.momCareReason(p.id);
      const talkReason = game.talkReason(p.id);
      const showMom = game.person('mom').status === 'home' && p.id !== 'mom' && p.health > 0;
      const worsenIn = p.health > 0 && !p.treatedToday ? game.difficulty.worsenDays - p.untreated : null;
      return `
        <li class="person" data-person="${p.id}">
          <div class="person-head">
            <span class="dot" style="--c:${p.color}"></span>
            <strong>${esc(p.name)}</strong>
            <span class="tags">
              ${tag(healthLabel(p.health))}${tag(hungerLabel(p.hunger))}${tag(thirstLabel(p.thirst))}
              ${when(p.mood > 0, () => tag(moodLabel(p.mood)))}
              ${when(p.treatedToday, '<span class="tag ok">치료함</span>')}
              ${when(incapable && !p.isPlayer, '<span class="tag bad">행동 불가</span>')}
            </span>
          </div>
          <div class="person-actions">
            <label class="ration food ${r.food ? 'on' : ''}" title="통조림 ¼캔"><input type="checkbox" data-action="ration" data-person="${p.id}" data-kind="food" ${r.food ? 'checked' : ''} />${CAN_ICON}<span>먹이기</span></label>
            <label class="ration water ${r.water ? 'on' : ''}" title="물 ¼병"><input type="checkbox" data-action="ration" data-person="${p.id}" data-kind="water" ${r.water ? 'checked' : ''} />${BOTTLE_ICON}<span>마시기</span></label>
            ${when(p.health > 0, () => `<button type="button" class="btn small" data-action="med" data-person="${p.id}" ${medReason ? `disabled title="${esc(medReason)}"` : ''}>구급약</button>`)}
            ${when(showMom, () => `<button type="button" class="btn small" data-action="mom-care" data-person="${p.id}" ${momReason ? `disabled title="${esc(momReason)}"` : ''}>엄마가 간호</button>`)}
            ${when(!p.isPlayer && p.mood > 0, () => `<button type="button" class="btn small" data-action="talk" data-person="${p.id}" ${talkReason ? `disabled title="${esc(talkReason)}"` : ''}>이야기 나누기</button>`)}
          </div>
          ${when(risk, () => `<p class="warning">오늘 밤 ${risk === '탈수' ? '물을 못 마시면' : '굶으면'} ${esc(josa(risk, '으로/로'))} 숨질 수 있다</p>`)}
          ${when(worsenIn != null && worsenIn <= 1, '<p class="warning">치료하지 않으면 오늘 밤 상처가 덧난다</p>')}
        </li>`;
    })
    .join('');
  const absent = game.people
    .filter((p) => !p.isPlayer && p.status !== 'home')
    .map((p) => {
      const label = {
        left: '데려오지 못했다',
        lost: '다시 만날 수 없다',
        dead: `세상을 떠났다 (${p.cause})`,
        outside: '집 밖',
        away: '탐사 중',
      }[p.status];
      return `<li>${esc(p.name)} — ${esc(label)}</li>`;
    })
    .join('');
  return `
    <section class="today-part" data-ref="family">
      <h3>식구들 <span class="count">${present.length}명</span></h3>
      <p class="need">한 끼 = 통조림 <b>¼캔</b> · 물 <b>¼병</b>. 오늘 배급: 통조림 <b>${esc(portions(game.rationCount('food')))}캔</b>, 물 <b>${esc(portions(game.rationCount('water')))}병</b></p>
      <p class="muted small">매일 먹일 필요는 없다. 물 없이 ${THIRST_DEATH}일, 먹지 못하고 ${HUNGER_DEATH}일을 넘기면 숨진다. 마음이 무너져 가는 식구와는 이야기를 나누자.</p>
      <ul class="people">${rows}</ul>
      ${when(absent, `<ul class="absent">${absent}</ul>`)}
      <div class="button-row tight">
        <button type="button" class="btn small" data-action="ration-all">모두 먹이기</button>
        <button type="button" class="btn small" data-action="ration-none">아무도 안 먹이기</button>
      </div>
    </section>`;
}

function expeditionSection(game, draft) {
  const exp = game.expedition;
  if (exp) {
    const who = game.person(exp.memberId);
    return `
      <section class="today-part expedition" data-ref="expedition">
        <h3>탐사</h3>
        <p><b>${esc(josa(who.name, '이/가'))}</b> ${exp.departDay}일차에 ${exp.withWeapon ? '야구 방망이를 들고 ' : ''}밖으로 나갔다. 늦어도 ${exp.departDay + EXPEDITION_DAYS[1]}일차 아침이면 소식이 있을 것이다.</p>
        <p class="muted small">밖에 나가 있는 사람은 먹지 않지만, 사건에서 도울 수 없다.</p>
      </section>`;
  }
  const blocked = game.expeditionReason();
  const candidates = game.presentPeople();
  const memberId = candidates.some((p) => p.id === draft.memberId && !game.expeditionReason(p.id))
    ? draft.memberId
    : (candidates.find((p) => !p.isPlayer && !game.expeditionReason(p.id)) ?? candidates.find((p) => !game.expeditionReason(p.id)))?.id;
  const withWeapon = draft.withWeapon && game.stock.weapon > 0;
  const members = candidates
    .map((p) => {
      const reason = game.expeditionReason(p.id);
      const note = reason ?? (p.isPlayer ? '돌아오지 못하면 끝이다' : p.health > 0 ? '다친 몸이다' : '보낼 수 있다');
      return `<label class="choice ${reason ? 'disabled' : ''} ${p.id === memberId ? 'on' : ''}">
          <input type="radio" name="exp-member" data-draft="memberId" value="${p.id}" ${p.id === memberId ? 'checked' : ''} ${reason ? 'disabled' : ''} />
          <span><b>${esc(p.name)}</b><br /><small>${esc(note)}</small></span></label>`;
    })
    .join('');
  const sendReason = blocked ?? (memberId ? null : '보낼 수 있는 사람이 없다');
  return `
    <section class="today-part expedition" data-ref="expedition">
      <h3>탐사 보내기</h3>
      <p class="muted small">한 명을 내보내 물자를 구해 오게 한다. 며칠 뒤 아침에 돌아온다. 무엇을 들고 올지는 알 수 없고, 다치거나 영영 돌아오지 못할 수도 있다.</p>
      <div class="choices">${members}</div>
      ${when(
        game.stock.weapon > 0,
        () => `<div class="expedition-options">
          <label class="ration ${withWeapon ? 'on' : ''}"><input type="checkbox" data-draft="withWeapon" ${withWeapon ? 'checked' : ''} /> 야구 방망이 챙겨 보내기</label>
        </div>`,
      )}
      <button type="button" class="btn primary" data-action="send-expedition" data-person="${memberId ?? ''}" ${sendReason ? 'disabled' : ''}>탐사 보내기</button>
      ${when(sendReason, () => `<p class="muted small">${esc(sendReason)}</p>`)}
    </section>`;
}

function shelfSection(game) {
  const rows = Object.entries(RESOURCES)
    .map(([key, res]) => {
      const n = game.stock[key];
      const amount = res.portions ? `${portions(n)}${res.unit}` : `${n}${res.unit}`;
      return `<li class="${n ? '' : 'zero'}" data-stock="${key}" data-n="${n}"><span>${esc(res.name)}</span><b>${esc(amount)}</b></li>`;
    })
    .join('');
  return `
    <section class="today-part shelf-part" data-ref="stock">
      <h3>선반 <span class="count">지금 남은 것</span></h3>
      <ul class="shelf">${rows}</ul>
    </section>`;
}

function actionsSection(game) {
  const endReason = game.canEndDay();
  const warnings = [];
  const present = game.presentPeople();
  const dry = present.filter((p) => needsWater(p) && !game.rations[p.id]?.water).length;
  const starving = present.filter((p) => needsFood(p) && !game.rations[p.id]?.food).length;
  if (dry) warnings.push(`목마른데 물을 못 받는 사람이 ${dry}명`);
  if (starving) warnings.push(`배고픈데 먹지 못하는 사람이 ${starving}명`);
  return `
    <section class="today-part actions" data-ref="actions">
      <button type="button" class="btn big end-day" data-action="end-day" ${endReason ? 'disabled' : ''}>일지를 덮고 잠자리에 든다 <small>→ ${game.day + 1}일차</small></button>
      ${when(endReason, () => `<p class="muted small">${esc(endReason)}</p>`)}
      ${when(!endReason && warnings.length, () => `<p class="warning small">${esc(warnings.join(' · '))}</p>`)}
    </section>`;
}

export function renderHome(game, ui = {}) {
  const draft = { memberId: null, withWeapon: false, ...ui.expedition };
  return `
    <section class="home-screen" data-screen="home">
      <header class="topbar">
        <div class="day-badge"><span>DAY</span><strong data-ref="day">${game.day}</strong></div>
        <div class="topbar-meta"><span class="level-badge ${game.difficulty.id}">${esc(game.difficulty.name)}</span> 집에 ${game.presentPeople().length}명 · 시드 ${game.seed}</div>
        <button type="button" class="btn ghost small" data-action="restart">처음부터</button>
      </header>
      ${renderShelter(game)}
      <div class="journal" data-ref="journal">
        ${diaryPage(game, ui)}
        <article class="page today" data-ref="today">
          ${eventSection(game)}
          ${familySection(game)}
          ${expeditionSection(game, draft)}
          ${actionsSection(game)}
        </article>
      </div>
    </section>`;
}

// ── 결말 ─────────────────────────────────────────

export function renderEnding(game) {
  const e = game.ending;
  const last = game.pendingEntries().map(entryHtml).join('');
  return `
    <section class="ending-screen ${e.type}" data-screen="ending" data-ending="${e.id}">
      <p class="kicker">${e.type === 'victory' ? '생존 성공' : '게임 오버'}</p>
      <h1>${esc(e.title)}</h1>
      <p class="ending-text">${esc(e.text)}</p>
      <dl class="stats">
        <div><dt>난이도</dt><dd>${esc(e.difficulty)}</dd></div>
        <div><dt>버틴 날</dt><dd>${e.day}일</dd></div>
        <div><dt>탐사</dt><dd>${e.expeditions}회</dd></div>
        <div><dt>함께한 사람</dt><dd>${esc(e.survivors.join(', ') || '없음')}</dd></div>
        <div><dt>잃은 사람</dt><dd>${esc(e.lost.join(', ') || '없음')}</dd></div>
      </dl>
      ${when(last, () => `<article class="page diary last-page" data-ref="last-page"><h2 class="page-day">${e.day}일차 · 마지막 쪽</h2>${last}</article>`)}
      <div class="button-row">
        <button type="button" class="btn primary big" data-action="new-game">새 게임 <small>난이도 고르기</small></button>
        <button type="button" class="btn big" data-action="same-seed">같은 시드로 다시 <small>${esc(game.difficulty.name)} · ${game.seed}</small></button>
      </div>
    </section>`;
}
