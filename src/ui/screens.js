// 실시간 구간 밖의 화면들: 시작, 집 생존(하루 단위), 결말.
import { EXPEDITION_DAYS, HUNGER_DEATH, MAX_QUIET_DAYS, THIRST_DEATH } from '../core/constants.js';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_ORDER } from '../core/difficulty.js';
import { CHAIN_DEFS } from '../core/events/index.js';
import { ITEMS, RESOURCES } from '../core/items.js';
import {
  deathRisk,
  defOf,
  healthLabel,
  hungerLabel,
  incapableReason,
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
        <li><b>생존</b> — 배급을 정하고, 사건과 미션에 대응한다. 물자가 모자라면 한 명을 탐사로 내보낸다. 무엇을 들고 올지, 돌아오기는 할지 아무도 모른다.</li>
        <li><b>탈출</b> — 버티기만 해서는 구조되지 않는다. 사건 속에서 탈출 경로를 열고, 그 조건을 채워야 이긴다.</li>
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

// ── 집 생존 ──────────────────────────────────────

function tag({ text, tone }) {
  return `<span class="tag ${tone}">${esc(text)}</span>`;
}

function eventKicker(view, label) {
  if (!view.chainId) return label;
  const def = CHAIN_DEFS[view.chainId];
  if (def.trigger === 'manual') return `${label} · 미션 「${esc(def.title)}」`;
  return `${label} · 탈출 경로 「${esc(def.title)}」 ${view.stage + 1}/${def.stages.length}단계`;
}

/** 오늘 이미 대응을 마친 사건(접힌 요약) */
function resolvedCard(view) {
  return `
    <section class="card event-card resolved earlier" data-event="${view.id}">
      <p class="kicker">${eventKicker(view, '오늘의 사건')} · 대응 완료</p>
      <h2>${esc(view.title)}</h2>
      <p class="outcome">${esc(view.outcome)}</p>
    </section>`;
}

function eventCard(game) {
  const earlier = game.resolvedToday.map(resolvedCard).join('');
  const view = game.eventView();
  if (!view) {
    const streak = game.quietStreak();
    return `
      <section class="card event-card quiet" data-ref="event">
        <p class="kicker">오늘의 사건</p>
        <h2>조용한 하루</h2>
        <p class="event-text">${game.day === 1 ? '집에 돌아온 첫날. 문을 걸어 잠그고 숨을 돌렸다.' : '창밖으로 좀비 몇이 어슬렁거릴 뿐, 별일 없이 지나간다.'}</p>
        <p class="muted small">사건 없는 날 ${streak}일째 · ${MAX_QUIET_DAYS}일 넘게 이어지지는 않는다</p>
      </section>`;
  }
  const options = view.options
    .map((opt) => {
      const chosen = view.resolved && view.choice === opt.id;
      const disabled = view.resolved || opt.disabled;
      const who = opt.who
        ? `<span class="who" style="--c:${defOf(opt.who).color}">${esc(defOf(opt.who).name)}</span>`
        : opt.tag
          ? `<span class="who" style="--c:#d8b46a">${esc(opt.tag)}</span>`
          : '';
      const meta = [opt.cost ? `소모: ${esc(opt.cost)}` : '', opt.note ? esc(opt.note) : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="option ${chosen ? 'chosen' : ''}" data-action="choose" data-option="${opt.id}" ${disabled ? 'disabled' : ''}>
          <span class="option-label">${who}${esc(opt.label)}</span>
          ${when(meta, `<span class="option-meta">${meta}</span>`)}
          ${when(!view.resolved && opt.reason, `<span class="option-reason">${esc(opt.reason)}</span>`)}
        </button>`;
    })
    .join('');
  return `${earlier}
    <section class="card event-card ${view.kind === 'chain' ? 'chain' : ''} ${view.resolved ? 'resolved' : 'pending'}" data-ref="event" data-event="${view.id}">
      <p class="kicker">${eventKicker(view, earlier ? '이어서 일어난 사건' : '오늘의 사건')}</p>
      <h2>${esc(view.title)}</h2>
      <p class="event-text">${esc(view.text)}</p>
      ${when(view.hint && !view.resolved, `<p class="event-hint">${esc(view.hint)}</p>`)}
      <div class="options">${options}</div>
      ${when(view.resolved, `<p class="outcome">${esc(view.outcome)}</p>`)}
    </section>`;
}

function familyCard(game) {
  const present = game.presentPeople();
  const need = game.dailyNeed();
  const foodGiven = game.rationCount('food');
  const waterGiven = game.rationCount('water');
  const hungry = present.filter(needsFood).length;
  const thirsty = present.filter(needsWater).length;
  const foodGivenToHungry = present.filter((p) => needsFood(p) && game.rations[p.id]?.food).length;
  const waterGivenToThirsty = present.filter((p) => needsWater(p) && game.rations[p.id]?.water).length;
  const rows = present
    .map((p) => {
      const r = game.rations[p.id] ?? { food: false, water: false };
      const risk = deathRisk(p, { fed: r.food, watered: r.water });
      const incapable = incapableReason(p);
      const medReason = game.medReason(p.id);
      const momReason = game.momCareReason(p.id);
      const showMom = game.person('mom').status === 'home' && p.id !== 'mom' && p.health > 0;
      const worsenIn = p.health > 0 && !p.treatedToday ? game.difficulty.worsenDays - p.untreated : null;
      return `
        <li class="person" data-person="${p.id}">
          <div class="person-head">
            <span class="dot" style="--c:${p.color}"></span>
            <strong>${esc(p.name)}</strong><span class="role">${esc(p.role)}</span>
          </div>
          <div class="tags">
            ${tag(healthLabel(p.health))}${tag(hungerLabel(p.hunger))}${tag(thirstLabel(p.thirst))}
            ${when(p.treatedToday, '<span class="tag ok">오늘 치료함</span>')}
            ${when(incapable && !p.isPlayer, `<span class="tag bad">행동 불가</span>`)}
          </div>
          <div class="person-actions">
            <label class="ration ${r.food ? 'on' : ''}"><input type="checkbox" data-action="ration" data-person="${p.id}" data-kind="food" ${r.food ? 'checked' : ''} /> 식량</label>
            <label class="ration ${r.water ? 'on' : ''}"><input type="checkbox" data-action="ration" data-person="${p.id}" data-kind="water" ${r.water ? 'checked' : ''} /> 물</label>
            ${when(p.health > 0, `<button type="button" class="btn small" data-action="med" data-person="${p.id}" ${medReason ? `disabled title="${esc(medReason)}"` : ''}>구급약 쓰기</button>`)}
            ${when(showMom, `<button type="button" class="btn small" data-action="mom-care" data-person="${p.id}" ${momReason ? `disabled title="${esc(momReason)}"` : ''}>엄마가 간호</button>`)}
          </div>
          ${when(risk, () => `<p class="warning">오늘 밤 ${risk === '탈수' ? '물을 못 마시면' : '굶으면'} ${esc(josa(risk, '으로/로'))} 숨질 수 있다</p>`)}
          ${when(worsenIn != null && worsenIn <= 1, `<p class="warning">치료하지 않으면 오늘 밤 부상이 악화된다</p>`)}
        </li>`;
    })
    .join('');
  const absent = game.people
    .filter((p) => !p.isPlayer && p.status !== 'home')
    .map((p) => {
      const label = {
        left: '데려오지 못했다 — 돌아올지도 모른다',
        lost: '다시 만날 수 없다',
        dead: `사망 (${p.cause})`,
        outside: '집 밖',
        away: '탐사 중',
      }[p.status];
      return `<li>${esc(p.name)}: ${esc(label)}</li>`;
    })
    .join('');
  return `
    <section class="card" data-ref="family">
      <h3>집에 있는 사람 <span class="count">${present.length}명</span></h3>
      <p class="need">전원 한 끼 <b>식량 ${need.food} · 물 ${need.water}</b> <span class="muted">(1인당 1개씩)</span>
        · 오늘 배급 <b>식량 ${foodGiven}</b> <b>물 ${waterGiven}</b>
        · 배고픈 사람 <b class="${hungry > foodGivenToHungry ? 'short' : ''}">${hungry}명</b>, 목마른 사람 <b class="${thirsty > waterGivenToThirsty ? 'short' : ''}">${thirsty}명</b></p>
      <p class="muted small">식량·물 1개가 한 사람의 한 끼다. 매일 줄 필요는 없지만, 물 없이 ${THIRST_DEATH}일, 식량 없이 ${HUNGER_DEATH}일을 넘기면 숨진다. 기본 배급표는 배고프거나 목마른 사람에게만 준다.</p>
      <div class="button-row tight">
        <button type="button" class="btn small" data-action="ration-all">가능한 만큼 전원 배급</button>
        <button type="button" class="btn small" data-action="ration-none">배급 비우기</button>
      </div>
      <ul class="people">${rows}</ul>
      ${when(absent, `<ul class="absent">${absent}</ul>`)}
    </section>`;
}

function expeditionCard(game, draft) {
  const exp = game.expedition;
  if (exp) {
    const who = game.person(exp.memberId);
    return `
      <section class="card expedition" data-ref="expedition">
        <h3>탐사</h3>
        <p><b>${esc(josa(who.name, '이/가'))}</b> 물자를 찾아 밖에 나가 있다${exp.withWeapon ? ' (야구 방망이를 챙김)' : ''}.
          ${exp.departDay}일차에 떠났고, 늦어도 ${exp.departDay + EXPEDITION_DAYS[1]}일차 아침이면 소식이 있을 것이다.</p>
        <p class="muted small">탐사 중인 사람은 식량과 물을 먹지 않지만, 사건에서 도울 수 없다. 탐사는 한 번에 한 명만 보낼 수 있다.</p>
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
      const note = reason ?? (p.isPlayer ? '돌아오지 못하면 게임이 끝난다' : p.health > 0 ? '다친 몸이라 더 위험하다' : '보낼 수 있다');
      return `<label class="choice ${reason ? 'disabled' : ''} ${p.id === memberId ? 'on' : ''}">
          <input type="radio" name="exp-member" data-draft="memberId" value="${p.id}" ${p.id === memberId ? 'checked' : ''} ${reason ? 'disabled' : ''} />
          <span><b>${esc(p.name)}</b> ${esc(p.role)}<br /><small>${esc(note)}</small></span></label>`;
    })
    .join('');
  const sendReason = blocked ?? (memberId ? null : '보낼 수 있는 사람이 없다');
  return `
    <section class="card expedition" data-ref="expedition">
      <h3>탐사 보내기 <span class="count">${game.expeditions}번 보냄</span></h3>
      <p class="muted small">한 명을 밖으로 내보내 물자를 구해 온다. 1~${EXPEDITION_DAYS[1]}일 뒤 아침에 돌아온다.
        무엇을 들고 올지는 알 수 없고, 다치거나 영영 돌아오지 못할 수도 있다. 떠나 있는 동안은 먹지 않지만 사건에서 도울 수 없다.</p>
      <div class="choices">${members}</div>
      ${when(
        game.stock.weapon > 0,
        () => `<div class="expedition-options">
          <label class="ration ${withWeapon ? 'on' : ''}"><input type="checkbox" data-draft="withWeapon" ${withWeapon ? 'checked' : ''} /> 야구 방망이 챙겨 보내기</label>
        </div>`,
      )}
      <button type="button" class="btn primary big" data-action="send-expedition" data-person="${memberId ?? ''}" ${sendReason ? 'disabled' : ''}>탐사 보내기</button>
      ${when(sendReason, () => `<p class="muted small">${esc(sendReason)}</p>`)}
    </section>`;
}

function missionsCard(game) {
  const missions = game.missionsView();
  if (!missions.length) return '';
  const label = { active: '진행 중', done: '완료', failed: '끝남' };
  const items = missions
    .map(
      (m) => `
        <article class="path mission ${m.status === 'active' ? 'open' : m.status}" data-mission="${m.id}">
          <header><span class="path-icon" aria-hidden="true">${m.icon}</span><strong>${esc(m.title)}</strong><span class="pill ${m.status === 'active' ? 'open' : m.status}">${label[m.status]}</span></header>
          ${when(m.schedule, () => `<p class="schedule">${esc(m.schedule)}</p>`)}
          ${when(m.text, () => `<p class="small">${esc(m.text)}</p>`)}
        </article>`,
    )
    .join('');
  return `
    <section class="card paths-card" data-ref="missions">
      <h3>미션</h3>
      ${items}
    </section>`;
}

function stockCard(game) {
  const rows = Object.entries(RESOURCES)
    .map(([key, res]) => {
      const n = game.stock[key];
      return `<li class="${n ? '' : 'zero'}" data-stock="${key}"><span>${esc(res.name)}</span><b>${n}</b></li>`;
    })
    .join('');
  return `
    <section class="card" data-ref="stock">
      <h3>집 재고</h3>
      <ul class="stock">${rows}</ul>
    </section>`;
}

function pathsCard(game) {
  const paths = game.pathsView();
  const visible = paths.filter((p) => p.status !== 'hidden');
  const hidden = paths.length - visible.length;
  const statusText = { open: '진행 중', done: '완료', failed: '실패', closed: '닫힘', missed: '놓침' };
  const items = visible
    .map((p) => {
      const steps = (p.steps ?? [])
        .map((s) => `<li class="${s.done ? 'done' : ''}">${s.done ? '✔' : '○'} ${esc(s.text)}</li>`)
        .join('');
      const reqs = (p.requirements ?? [])
        .map((r) => {
          const ok = r.ok ?? r.have >= r.need;
          const count = r.need != null ? ` <b>${r.have}/${r.need}</b>` : '';
          return `<li class="${ok ? 'ok' : 'todo'}">${ok ? '✔' : '✗'} ${esc(r.text)}${count}${when(r.detail, ` <small>${esc(r.detail)}</small>`)}</li>`;
        })
        .join('');
      return `
        <article class="path ${p.status}" data-path="${p.id}">
          <header><span class="path-icon" aria-hidden="true">${p.icon}</span><strong>${esc(p.title)}</strong><span class="pill ${p.status}">${statusText[p.status]}</span></header>
          ${when(p.schedule, `<p class="schedule">${esc(p.schedule)}</p>`)}
          ${when(steps, `<ol class="steps">${steps}</ol>`)}
          ${when(reqs, `<p class="small muted">조건</p><ul class="reqs">${reqs}</ul>`)}
          ${when(p.next, `<p class="next"><b>다음 할 일</b> ${esc(p.next)}</p>`)}
        </article>`;
    })
    .join('');
  const anyOpen = visible.some((p) => p.status === 'open');
  return `
    <section class="card paths-card" data-ref="paths">
      <h3>탈출 계획</h3>
      ${when(!anyOpen, '<p class="warning">열린 탈출 경로가 없다. 집에서 버티기만 해서는 구조되지 않는다.</p>')}
      ${items}
      ${when(hidden, `<p class="muted small">아직 드러나지 않은 탈출 기회가 ${hidden}가지 더 있다. 사건에 귀를 기울이자.</p>`)}
    </section>`;
}

function actionsCard(game) {
  const endReason = game.canEndDay();
  const warnings = [];
  const present = game.presentPeople();
  const dry = present.filter((p) => needsWater(p) && !game.rations[p.id]?.water).length;
  const starving = present.filter((p) => needsFood(p) && !game.rations[p.id]?.food).length;
  if (dry) warnings.push(`목마른데 물을 못 받는 사람이 ${dry}명`);
  if (starving) warnings.push(`배고픈데 식량을 못 받는 사람이 ${starving}명`);
  return `
    <section class="card actions" data-ref="actions">
      <div class="action">
        <button type="button" class="btn big" data-action="end-day" ${endReason ? 'disabled' : ''}>하루 마치기 <small>→ ${game.day + 1}일차</small></button>
        ${when(endReason, () => `<p class="muted small">${esc(endReason)}</p>`)}
        ${when(!endReason && warnings.length, () => `<p class="warning small">${esc(warnings.join(' · '))}</p>`)}
      </div>
    </section>`;
}

function logCard(game) {
  const entries = game.log
    .slice(-14)
    .reverse()
    .map((e) => `<li class="${e.tone}"><span class="log-day">${e.day ? `${e.day}일` : '출발'}</span>${esc(e.text)}</li>`)
    .join('');
  return `
    <section class="card log-card">
      <h3>기록</h3>
      <ul class="log">${entries}</ul>
    </section>`;
}

export function renderHome(game, ui = {}) {
  const draft = { memberId: null, withWeapon: false, ...ui.expedition };
  const scramble = game.day === 1 && game.lastRun ? game.lastRun : null;
  const report = game.expeditionReport && game.expeditionReport.day === game.day ? game.expeditionReport : null;
  return `
    <section class="home-screen" data-screen="home">
      <header class="topbar">
        <div class="day-badge"><span>DAY</span><strong data-ref="day">${game.day}</strong></div>
        <div class="topbar-meta"><span class="level-badge ${game.difficulty.id}">${esc(game.difficulty.name)}</span> 집에 ${game.presentPeople().length}명 · 탐사 ${game.expeditions}회 · 시드 ${game.seed}</div>
        <button type="button" class="btn ghost small" data-action="restart">처음부터</button>
      </header>
      ${renderShelter(game)}
      ${when(
        scramble,
        () => `<p class="night-report good"><b>60초 탐색</b> 들여놓은 물품 ${scramble.items.length}개${
          scramble.items.length ? ` (${esc(scramble.items.map((id) => ITEMS[id].name).join(', '))})` : ''
        } · 함께 온 가족 ${scramble.family.length ? esc(scramble.family.map((id) => defOf(id).name).join(', ')) : '없음'}</p>`,
      )}
      ${when(report, () => `<p class="night-report ${report.outcome === 'lost' ? 'bad' : report.outcome === 'injured' ? '' : 'good'}" data-ref="report"><b>탐사 결과</b> ${esc(report.text)}</p>`)}
      ${when(game.day > 1 && game.nightReport.length, () => `<p class="night-report"><b>지난밤</b> ${esc(game.nightReport.join(' / '))}</p>`)}
      <div class="home-grid">
        <div class="col">
          ${eventCard(game)}
          ${familyCard(game)}
          ${expeditionCard(game, draft)}
          ${actionsCard(game)}
          ${logCard(game)}
        </div>
        <div class="col">
          ${pathsCard(game)}
          ${missionsCard(game)}
          ${stockCard(game)}
        </div>
      </div>
    </section>`;
}

// ── 결말 ─────────────────────────────────────────

export function renderEnding(game) {
  const e = game.ending;
  const paths = game
    .pathsView()
    .filter((p) => p.status !== 'hidden')
    .map((p) => `<li>${p.icon} ${esc(p.title)}: ${{ open: '진행 중', done: '완료', failed: '실패', closed: '닫힘', missed: '놓침' }[p.status]}</li>`)
    .join('');
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
      ${when(paths, `<ul class="ending-paths">${paths}</ul>`)}
      <div class="button-row">
        <button type="button" class="btn primary big" data-action="new-game">새 게임 <small>난이도 고르기</small></button>
        <button type="button" class="btn big" data-action="same-seed">같은 시드로 다시 <small>${esc(game.difficulty.name)} · ${game.seed}</small></button>
      </div>
    </section>`;
}
