// 실시간 구간 밖의 화면들: 시작, 가족 선택, 집 생존(하루 단위), 결말.
import { HUNGER_DEATH, INJURY_WORSEN_DAYS, MAX_QUIET_DAYS, RUN_SECONDS, THIRST_DEATH } from '../core/constants.js';
import { CHAIN_DEFS } from '../core/events/index.js';
import { ITEMS, RESOURCES } from '../core/items.js';
import { FAMILY_DEFS, deathRisk, defOf, healthLabel, hungerLabel, incapableReason, thirstLabel } from '../core/people.js';
import { josa } from '../core/text.js';
import { esc, when } from './dom.js';

// ── 시작 화면 ────────────────────────────────────

export function renderTitle({ seed }) {
  return `
    <section class="title-screen" data-screen="title">
      <p class="kicker">좀비 생존 게임</p>
      <h1>마트 탈출 <span>60초</span></h1>
      <p class="tagline">정전된 대형 마트, 몰려드는 좀비, 그리고 집 주변에 흩어진 가족.<br />
        60초 안에 내린 선택이 남은 날들을 결정한다.</p>
      <ol class="rules">
        <li><b>마트 탈출</b> — 60초 안에 4칸 가방에 물자를 챙겨 집까지 달린다. 물건을 고르는 시간도 60초에 포함된다.</li>
        <li><b>가족</b> — 집 주변에 흩어진 가족 3명을 데려올지 한 명씩 정한다. 식구가 늘면 식량과 물이 더 들지만, 할 수 있는 일도 늘어난다.</li>
        <li><b>생존</b> — 하루하루 배급을 정하고, 구급약을 쓰고, 사건에 대응한다. 필요하면 다시 마트로 보급을 나간다(집을 나서는 순간부터 60초).</li>
        <li><b>탈출</b> — 버티기만 해서는 구조되지 않는다. 사건 속에서 탈출 경로를 열고, 그 조건을 채워야 이긴다.</li>
      </ol>
      <form class="start-form" data-form="start">
        <label>시드 <input name="seed" inputmode="numeric" placeholder="비우면 무작위" value="${esc(seed ?? '')}" /></label>
        <button type="submit" class="btn primary big">게임 시작</button>
      </form>
      <p class="muted small">조작: 이동 WASD·방향키(또는 화면을 누른 채 끌기) · 줍기 E/Space · 내려놓기 1~4</p>
    </section>`;
}

// ── 가족 선택 ────────────────────────────────────

export function renderFamily(game) {
  const candidate = game.familyCandidate();
  const index = FAMILY_DEFS.length - game.familyQueue.length + 1;
  const def = defOf(candidate.id);
  const present = game.presentPeople().length;
  const decided = FAMILY_DEFS.filter((d) => !game.familyQueue.includes(d.id));
  const carried = game.inventory.items.map((id) => ITEMS[id].name);
  return `
    <section class="family-screen" data-screen="family">
      <div class="family-intro">
        <p class="kicker">첫 귀가 · 가족 찾기 ${index} / ${FAMILY_DEFS.length}</p>
        <h1>집 앞에 도착했다</h1>
        <p>좀비를 따돌리고 집 앞에 섰다. 집 주변 여기저기에 가족이 숨어 있다. 한 명씩 데려올지 정하자.
           함께하는 사람이 많을수록 하루에 필요한 식량과 물이 늘어나지만, 가족마다 할 수 있는 일이 있다.</p>
        <p class="muted">가져온 물품: ${carried.length ? esc(carried.join(', ')) : '없음'}</p>
      </div>
      <article class="card family-card">
        <div class="person-head big">
          <span class="dot" style="--c:${def.color}"></span>
          <h2>${esc(def.name)} <small>${esc(def.role)}</small></h2>
        </div>
        <p><b>위치</b> ${esc(def.where)}</p>
        <p><b>상태</b> ${tag(healthLabel(candidate.health))}</p>
        <p><b>함께하면</b> ${esc(def.perk)}</p>
        <p class="cost"><b>대가</b> 하루 필요량 식량 ${present} → <b>${present + 1}</b>, 물 ${present} → <b>${present + 1}</b></p>
        <div class="button-row">
          <button type="button" class="btn primary big" data-action="family" data-person="${def.id}" data-bring="1">${esc(josa(def.name, '을/를'))} 데려온다</button>
          <button type="button" class="btn big" data-action="family" data-person="${def.id}" data-bring="0">두고 간다</button>
        </div>
      </article>
      ${when(
        decided.length,
        `<ul class="decisions">${decided
          .map((d) => {
            const p = game.person(d.id);
            return `<li>${esc(d.name)}: ${p.status === 'home' ? '데려옴' : '두고 옴'}</li>`;
          })
          .join('')}</ul>`,
      )}
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
      const label = { left: '두고 옴 — 돌아올지도 모른다', lost: '다시 만날 수 없다', dead: `사망 (${p.cause})`, outside: '집 밖' }[p.status];
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

function bagCard(game) {
  const inv = game.inventory;
  const cells = inv
    .layout()
    .map(
      (cell) => `<button type="button" class="bag-item" style="grid-column: span ${cell.slots}" data-action="deposit" data-index="${cell.index}" title="재고로 옮기기">
        ${esc(ITEMS[cell.itemId].name)}<small>${cell.slots}칸 · ${esc(ITEMS[cell.itemId].note)}</small></button>`,
    )
    .join('');
  const empties = Array.from({ length: inv.free }, () => '<span class="bag-empty">빈칸</span>').join('');
  return `
    <section class="card" data-ref="bag">
      <h3>가방 <span class="count">${inv.used}/${inv.capacity}칸</span></h3>
      <div class="bag-cells">${cells}${empties}</div>
      ${
        inv.isEmpty
          ? '<p class="muted small">가방이 비어 있다.</p>'
          : `<p class="warning">가방의 물품은 재고로 옮겨야 쓸 수 있다.</p>
             <button type="button" class="btn primary" data-action="deposit-all">모두 재고로 옮기기</button>`
      }
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
  const danger = game.nextRunDanger();
  const rows = Object.entries(summary)
    .map(([id, n]) => `<li class="${n ? '' : 'zero'}"><span>${esc(ITEMS[id].name)}</span><b>${n}</b><small>${ITEMS[id].slots}칸</small></li>`)
    .join('');
  return `
    <section class="card" data-ref="mart">
      <h3>마트에 남은 물자</h3>
      <ul class="mart-list">${rows}</ul>
      <p class="muted small">다음 보급 예상: 좀비 ${danger.martZombies + danger.streetZombies}마리로 시작, 최대 ${danger.maxZombies}마리 · 보급을 나갈수록 위험해진다.</p>
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
  const runReason = game.canStartSupplyRun();
  const endReason = game.canEndDay();
  const warnings = [];
  if (!game.inventory.isEmpty) warnings.push('가방에 재고로 옮기지 않은 물품이 있다');
  const need = game.dailyNeed();
  if (game.rationCount('water') < need.water) warnings.push(`물을 못 마시는 사람이 ${need.water - game.rationCount('water')}명`);
  if (game.rationCount('food') < need.food) warnings.push(`굶는 사람이 ${need.food - game.rationCount('food')}명`);
  return `
    <section class="card actions" data-ref="actions">
      <div class="action">
        <button type="button" class="btn primary big" data-action="supply" ${runReason ? 'disabled' : ''}>마트로 보급 나가기 <small>${RUN_SECONDS}초 · 오늘 ${game.ranToday ? '이미 다녀옴' : '1번 가능'}</small></button>
        ${when(runReason, `<p class="muted small">${esc(runReason)}</p>`)}
        ${when(!runReason, '<p class="muted small">집을 나서는 순간부터 60초. 마트까지 가는 길과 돌아오는 길이 모두 포함된다.</p>')}
      </div>
      <div class="action">
        <button type="button" class="btn big" data-action="end-day" ${endReason ? 'disabled' : ''}>하루 마치기 <small>→ ${game.day + 1}일차</small></button>
        ${when(endReason, `<p class="muted small">${esc(endReason)}</p>`)}
        ${when(!endReason && warnings.length, `<p class="warning small">${esc(warnings.join(' · '))}</p>`)}
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

export function renderHome(game) {
  const lastRun = game.lastRun && game.lastRun.day === game.day && game.lastRun.mode === 'supply' ? game.lastRun : null;
  return `
    <section class="home-screen" data-screen="home">
      <header class="topbar">
        <div class="day-badge"><span>DAY</span><strong data-ref="day">${game.day}</strong></div>
        <div class="topbar-meta">보급 ${game.runs}회 · 집에 ${game.presentPeople().length}명 · 시드 ${game.seed}</div>
        <button type="button" class="btn ghost small" data-action="restart">처음부터</button>
      </header>
      ${when(
        game.day > 1 && game.nightReport.length,
        `<p class="night-report"><b>지난밤</b> ${esc(game.nightReport.join(' / '))}</p>`,
      )}
      ${when(lastRun, () => `<p class="night-report good"><b>보급 결과</b> ${lastRun.carried.length ? esc(lastRun.carried.map((id) => ITEMS[id].name).join(', ')) : '빈손'} · 남은 시간 ${lastRun.timeLeft.toFixed(1)}초</p>`)}
      <div class="home-grid">
        <div class="col">
          ${eventCard(game)}
          ${familyCard(game)}
          ${actionsCard(game)}
          ${logCard(game)}
        </div>
        <div class="col">
          ${pathsCard(game)}
          ${bagCard(game)}
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
        <div><dt>보급</dt><dd>${e.runs}회</dd></div>
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
