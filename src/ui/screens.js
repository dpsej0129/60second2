// 실시간 구간 밖의 화면들: 시작, 집 생존(하루 단위), 결말.
import { EXPEDITION_DAYS, HUNGER_DEATH, INJURY_WORSEN_DAYS, MAX_QUIET_DAYS, THIRST_DEATH } from '../core/constants.js';
import { CHAIN_DEFS } from '../core/events/index.js';
import { targetOf } from '../core/expedition.js';
import { ITEMS, RESOURCES } from '../core/items.js';
import { deathRisk, defOf, healthLabel, hungerLabel, incapableReason, thirstLabel } from '../core/people.js';
import { josa } from '../core/text.js';
import { esc, when } from './dom.js';
import { renderShelter } from './shelter.js';

// ── 시작 화면 ────────────────────────────────────

export function renderTitle({ seed }) {
  return `
    <section class="title-screen" data-screen="title">
      <p class="kicker">좀비 생존 게임</p>
      <h1>마트 탈출 <span>60초</span></h1>
      <p class="tagline">정전된 대형 마트, 몰려드는 좀비, 그리고 집 주변에 흩어진 가족.<br />
        60초 안에 내린 선택이 남은 날들을 결정한다.</p>
      <ol class="rules">
        <li><b>60초</b> — 마트와 집을 오가며 4칸 가방으로 물자를 나른다. 집 앞에 들어서면 가방을 비우고 다시 나갈 수 있다. 60초가 끝날 때 집 앞에 있어야 산다.</li>
        <li><b>가족</b> — 집 주변에 흩어져 숨은 가족 3명도 칸을 차지한다. 물자와 가족 중 무엇을 먼저 옮길지 정하자. 식구가 늘면 식량과 물이 더 들지만, 할 수 있는 일도 늘어난다.</li>
        <li><b>생존</b> — 하루하루 배급을 정하고, 구급약을 쓰고, 사건에 대응한다. 물자가 모자라면 한 명을 탐사로 내보낸다. 며칠 뒤 돌아오거나, 돌아오지 못한다.</li>
        <li><b>탈출</b> — 버티기만 해서는 구조되지 않는다. 사건 속에서 탈출 경로를 열고, 그 조건을 채워야 이긴다.</li>
      </ol>
      <form class="start-form" data-form="start">
        <label>시드 <input name="seed" inputmode="numeric" placeholder="비우면 무작위" value="${esc(seed ?? '')}" /></label>
        <button type="submit" class="btn primary big">게임 시작</button>
      </form>
      <p class="muted small">조작: 이동 WASD·방향키(또는 화면을 누른 채 끌기) · 줍기 E/Space · 내려놓기 1~4</p>
    </section>`;
}

// ── 집 생존 ──────────────────────────────────────

function tag({ text, tone }) {
  return `<span class="tag ${tone}">${esc(text)}</span>`;
}

function eventCard(game) {
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
  const chainDef = view.chainId ? game.pathsView().find((p) => p.id === view.chainId) : null;
  const kicker = chainDef
    ? `오늘의 사건 · 탈출 경로 「${esc(chainDef.title)}」 ${view.stage + 1}/${CHAIN_DEFS[view.chainId].stages.length}단계`
    : '오늘의 사건';
  const options = view.options
    .map((opt) => {
      const chosen = view.resolved && view.choice === opt.id;
      const disabled = view.resolved || opt.disabled;
      const who = opt.who ? `<span class="who" style="--c:${defOf(opt.who).color}">${esc(defOf(opt.who).name)}</span>` : '';
      const meta = [opt.cost ? `소모: ${esc(opt.cost)}` : '', opt.note ? esc(opt.note) : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="option ${chosen ? 'chosen' : ''}" data-action="choose" data-option="${opt.id}" ${disabled ? 'disabled' : ''}>
          <span class="option-label">${who}${esc(opt.label)}</span>
          ${when(meta, `<span class="option-meta">${meta}</span>`)}
          ${when(!view.resolved && opt.reason, `<span class="option-reason">${esc(opt.reason)}</span>`)}
        </button>`;
    })
    .join('');
  return `
    <section class="card event-card ${view.kind === 'chain' ? 'chain' : ''} ${view.resolved ? 'resolved' : 'pending'}" data-ref="event" data-event="${view.id}">
      <p class="kicker">${kicker}</p>
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
  const rows = present
    .map((p) => {
      const r = game.rations[p.id] ?? { food: false, water: false };
      const risk = deathRisk(p, { fed: r.food, watered: r.water });
      const incapable = incapableReason(p);
      const medReason = game.medReason(p.id);
      const momReason = game.momCareReason(p.id);
      const showMom = game.person('mom').status === 'home' && p.id !== 'mom' && p.health > 0;
      const worsenIn = p.health > 0 && !p.treatedToday ? INJURY_WORSEN_DAYS - p.untreated : null;
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
      <p class="need">하루 필요량 <b>식량 ${need.food} · 물 ${need.water}</b> <span class="muted">(1인당 1씩)</span>
        · 오늘 배급 <b class="${foodGiven < need.food ? 'short' : ''}">식량 ${foodGiven}/${need.food}</b>
        <b class="${waterGiven < need.water ? 'short' : ''}">물 ${waterGiven}/${need.water}</b></p>
      <p class="muted small">배급하지 않으면 배고픔·목마름이 쌓인다. 물 없이 ${THIRST_DEATH}일, 식량 없이 ${HUNGER_DEATH}일을 넘기면 숨진다.</p>
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
        <p><b>${esc(who.name)}</b>${josa(who.name, '이/가').slice(who.name.length)} ${esc(josa(targetOf(exp.targetId).name, '을/를'))} 찾으러 마트에 가 있다
          ${exp.withWeapon ? '(야구 방망이를 챙김)' : ''}. ${exp.departDay}일차에 떠났고, 늦어도 ${exp.departDay + EXPEDITION_DAYS[1]}일차 아침이면 소식이 있을 것이다.</p>
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
      const risk = game.expeditionRisk(p.id, withWeapon);
      const riskText = `부상 ${Math.round(risk.injury * 100)}% · 실종 ${Math.round(risk.lost * 100)}%`;
      return `<label class="choice ${reason ? 'disabled' : ''} ${p.id === memberId ? 'on' : ''}">
          <input type="radio" name="exp-member" data-draft="memberId" value="${p.id}" ${p.id === memberId ? 'checked' : ''} ${reason ? 'disabled' : ''} />
          <span><b>${esc(p.name)}</b> ${esc(p.role)}${p.isPlayer ? ' · 돌아오지 못하면 게임 끝' : ''}${p.trait === 'guard' ? ' · 위험이 적다' : ''}<br />
          <small>${esc(reason ?? riskText)}</small></span></label>`;
    })
    .join('');
  const targets = game
    .expeditionTargets()
    .map((t) => `<option value="${t.id}" ${t.id === draft.targetId ? 'selected' : ''}>${esc(t.name)} (마트에 ${t.remaining}개)</option>`)
    .join('');
  const sendReason = blocked ?? (memberId ? null : '보낼 수 있는 사람이 없다');
  return `
    <section class="card expedition" data-ref="expedition">
      <h3>탐사 보내기 <span class="count">${game.expeditions}번 다녀옴 · 갈수록 위험해진다</span></h3>
      <p class="muted small">한 명을 마트로 보내 물자를 구해 온다. 1~${EXPEDITION_DAYS[1]}일 뒤 아침에 돌아오고, 최대 4칸을 들고 온다.
        다치거나 돌아오지 못할 수도 있다. 떠나 있는 동안은 먹지 않지만 사건에서 도울 수 없다.</p>
      <div class="choices">${members}</div>
      <div class="expedition-options">
        <label>찾아올 것 <select data-draft="targetId">${targets}</select></label>
        ${when(
          game.stock.weapon > 0,
          `<label class="ration ${withWeapon ? 'on' : ''}"><input type="checkbox" data-draft="withWeapon" ${withWeapon ? 'checked' : ''} /> 야구 방망이 챙겨 보내기</label>`,
        )}
      </div>
      <button type="button" class="btn primary big" data-action="send-expedition" data-person="${memberId ?? ''}" ${sendReason ? 'disabled' : ''}>탐사 보내기</button>
      ${when(sendReason, () => `<p class="muted small">${esc(sendReason)}</p>`)}
    </section>`;
}

function stockCard(game) {
  const people = Math.max(1, game.presentPeople().length);
  const rows = Object.entries(RESOURCES)
    .map(([key, res]) => {
      const n = game.stock[key];
      const extra = key === 'food' || key === 'water' ? ` <span class="muted">(${people}명이면 ${Math.floor(n / people)}일분)</span>` : '';
      return `<li class="${n ? '' : 'zero'}" data-stock="${key}"><span>${esc(res.name)}</span><b>${n}</b>${extra}</li>`;
    })
    .join('');
  return `
    <section class="card" data-ref="stock">
      <h3>집 재고</h3>
      <ul class="stock">${rows}</ul>
    </section>`;
}

function martCard(game) {
  const summary = game.martSummary();
  const rows = Object.entries(summary)
    .map(([id, n]) => `<li class="${n ? '' : 'zero'}"><span>${esc(ITEMS[id].name)}</span><b>${n}</b><small>${ITEMS[id].slots}칸</small></li>`)
    .join('');
  return `
    <section class="card" data-ref="mart">
      <h3>마트에 남은 물자</h3>
      <ul class="mart-list">${rows}</ul>
      <p class="muted small">탐사로 가져올 수 있는 남은 물자. 마트 물자는 다시 채워지지 않는다.</p>
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
  const need = game.dailyNeed();
  if (game.rationCount('water') < need.water) warnings.push(`물을 못 마시는 사람이 ${need.water - game.rationCount('water')}명`);
  if (game.rationCount('food') < need.food) warnings.push(`굶는 사람이 ${need.food - game.rationCount('food')}명`);
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
  const draft = { memberId: null, targetId: 'supplies', withWeapon: false, ...ui.expedition };
  const scramble = game.day === 1 && game.lastRun ? game.lastRun : null;
  const report = game.expeditionReport && game.expeditionReport.day === game.day ? game.expeditionReport : null;
  return `
    <section class="home-screen" data-screen="home">
      <header class="topbar">
        <div class="day-badge"><span>DAY</span><strong data-ref="day">${game.day}</strong></div>
        <div class="topbar-meta">집에 ${game.presentPeople().length}명 · 탐사 ${game.expeditions}회 · 시드 ${game.seed}</div>
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
          ${stockCard(game)}
          ${martCard(game)}
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
        <div><dt>버틴 날</dt><dd>${e.day}일</dd></div>
        <div><dt>탐사</dt><dd>${e.expeditions}회</dd></div>
        <div><dt>함께한 사람</dt><dd>${esc(e.survivors.join(', ') || '없음')}</dd></div>
        <div><dt>잃은 사람</dt><dd>${esc(e.lost.join(', ') || '없음')}</dd></div>
      </dl>
      ${when(paths, `<ul class="ending-paths">${paths}</ul>`)}
      <div class="button-row">
        <button type="button" class="btn primary big" data-action="new-game">새 게임</button>
        <button type="button" class="btn big" data-action="same-seed">같은 시드(${game.seed})로 다시</button>
      </div>
    </section>`;
}
