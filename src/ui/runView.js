// 60초 실시간 구간 화면: 캔버스 지도 + 남은 시간·가방·줍기 안내 HUD + 키보드/터치 입력.
import { INVENTORY_SLOTS, SIM_STEP } from '../core/constants.js';
import { carryInfo, isPerson } from '../core/inventory.js';
import { ITEMS } from '../core/items.js';
import { pickupPreview, playerSpeed, zombieSight } from '../core/run.js';
import {
  CARS,
  FAMILY_SPOTS,
  HOME_ZONE,
  HOUSE,
  MART,
  MART_DOORS,
  RACKS,
  SHELVES,
  START,
  WALLS,
  WORLD,
  inMart,
} from '../core/world.js';
import { FAMILY_DEFS } from '../core/people.js';
import { esc } from './dom.js';

const KEY_DIRS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};
const INTERACT_KEYS = new Set(['KeyE', 'Space', 'Enter', 'NumpadEnter']);
const DROP_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

const COLORS = {
  ground: '#17191c',
  street: '#24272b',
  lane: '#4a4d52',
  martFloor: '#30363c',
  wall: '#a4adb6',
  door: '#e3b341',
  rack: '#6d5536',
  rackEdge: '#4a3a24',
  label: '#f1ede4',
  muted: '#9aa1a8',
  car: '#475161',
  carGlass: '#6f8197',
  house: '#8b5e3c',
  roof: '#5d3b24',
  homeZone: 'rgba(110, 200, 120, 0.22)',
  player: '#4ea1ff',
  zombie: '#6ea84f',
  zombieChase: '#a3d977',
  danger: '#ff5a4f',
  highlight: '#ffd34d',
};

export class RunView {
  constructor({ root, game, timescale = 1, onFinished }) {
    this.root = root;
    this.game = game;
    this.timescale = timescale;
    this.onFinished = onFinished;
    this.keys = new Set();
    this.pointer = null;
    this.pendingInteract = false;
    this.pendingDrop = null;
    this.destroyed = false;
    this.finishing = false;
    this.lastFrame = null;
    this.accumulator = 0;
    this.bagSignature = null;
    this.toastSignature = null;
    this.homeSignature = null;
    this.mount();
  }

  // ── DOM ────────────────────────────────────

  mount() {
    const first = this.game.phase === 'ready';
    this.root.innerHTML = `
      <section class="run-screen" data-screen="run">
        <div class="run-hud">
          <div class="hud-timer" data-ref="timerBox">
            <span class="hud-label">남은 시간</span>
            <span class="hud-time" data-ref="time">60.0</span>
          </div>
          <div class="hud-mid">
            <div class="hud-goal" data-ref="goal"></div>
            <div class="hud-home" data-ref="home"></div>
          </div>
          <div class="hud-bag">
            <span class="hud-label">가방 <b data-ref="bagCount">0/${INVENTORY_SLOTS}칸</b></span>
            <div class="bag-cells" data-ref="bag"></div>
          </div>
        </div>
        <div class="run-stage" data-ref="stage">
          <canvas data-ref="canvas" aria-label="마트와 집 사이 지도"></canvas>
          <div class="run-prompt" data-ref="prompt" hidden></div>
          <div class="run-toasts" data-ref="toasts"></div>
          <div class="run-overlay" data-ref="overlay" ${first ? '' : 'hidden'}>
            ${first ? this.briefingHtml() : ''}
          </div>
        </div>
        <div class="run-controls">
          <button type="button" class="btn" data-ref="pickBtn">줍기 <kbd>E</kbd></button>
          <p class="run-help">이동 <kbd>WASD</kbd>·<kbd>방향키</kbd> 또는 화면을 누른 채 끌기 · 줍기·데려가기 <kbd>E</kbd>/<kbd>Space</kbd> · 내려놓기 <kbd>1</kbd>~<kbd>4</kbd> 또는 가방 칸 누르기 · 집 앞에서 <kbd>E</kbd> = 문 잠그고 들어가기</p>
        </div>
      </section>`;
    this.refs = {};
    for (const el of this.root.querySelectorAll('[data-ref]')) this.refs[el.dataset.ref] = el;
    this.ctx = this.refs.canvas.getContext('2d');

    this.onKeyDown = (e) => this.handleKey(e, true);
    this.onKeyUp = (e) => this.handleKey(e, false);
    this.onBlur = () => this.keys.clear();
    this.onResize = () => this.resize();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);

    const canvas = this.refs.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointer = this.toWorld(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointer) this.pointer = this.toWorld(e);
    });
    const release = () => {
      this.pointer = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    this.refs.pickBtn.addEventListener('click', () => {
      this.pendingInteract = true;
    });
    this.refs.bag.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-index]');
      if (cell) this.pendingDrop = Number(cell.dataset.index);
    });
    this.root.querySelector('[data-action="start-run"]')?.addEventListener('click', () => this.start());

    this.resize();
    this.renderHud();
    this.draw();
    this.frame = requestAnimationFrame((t) => this.loop(t));
  }

  briefingHtml() {
    return `
      <div class="briefing">
        <p class="kicker">60초</p>
        <h2>대형 마트 안에 갇혔다</h2>
        <p>정전된 매장 밖에서 좀비의 신음이 들린다. 카운트다운이 시작되면 좀비가 몰려온다.
           <b>60초 동안</b> 마트와 지도 오른쪽 끝의 <b>집</b>을 오가며 물자와 가족을 집으로 옮겨야 한다.</p>
        <ul>
          <li>가방은 <b>4칸</b>. 생수·통조림은 1칸(1개 = 식량·물 1), 대형 구급상자·공구 상자·연료통은 2칸을 차지한다.</li>
          <li>집 앞 <b>도착 구역</b>에 들어서면 가방이 저절로 비워지고 주변 좀비가 흩어진다. 몇 번이고 다시 다녀올 수 있다.</li>
          <li>집 주변에 숨은 <b>가족도 칸을 차지한다</b>(아빠 3칸, 엄마·동생 2칸). 데려오지 못한 가족은 남겨진다.</li>
          <li><b>60초가 끝날 때 도착 구역 안에 있어야 산다.</b> 일찍 끝내려면 도착 구역에서 <kbd>E</kbd>로 문을 잠그고 들어간다.</li>
          <li>줍는 데는 0.3초. 선반과 벽 뒤에 숨으면 좀비가 보지 못한다.</li>
        </ul>
        <button type="button" class="btn primary big" data-action="start-run">카운트다운 시작 <kbd>Enter</kbd></button>
      </div>`;
  }

  start() {
    if (this.game.phase !== 'ready') return;
    this.refs.overlay.hidden = true;
    this.refs.overlay.innerHTML = '';
    this.game.startFirstRun();
    this.lastFrame = null;
    this.accumulator = 0;
  }

  handleKey(e, down) {
    if (e.target instanceof HTMLInputElement) return;
    const code = e.code || e.key;
    if (this.game.phase === 'ready') {
      if (down && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) {
        e.preventDefault();
        this.start();
      }
      return;
    }
    if (KEY_DIRS[code] || INTERACT_KEYS.has(code)) e.preventDefault();
    if (KEY_DIRS[code]) {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
    } else if (down && !e.repeat && INTERACT_KEYS.has(code)) {
      this.pendingInteract = true;
    } else if (down && !e.repeat && code in DROP_KEYS) {
      this.pendingDrop = DROP_KEYS[code];
    }
  }

  resize() {
    const { canvas, stage } = this.refs;
    const width = stage.clientWidth || 960;
    const narrow = width < 820;
    this.viewW = narrow ? 860 : 1280;
    this.viewH = Math.round((this.viewW * 9) / 16);
    const cssH = Math.round(width * (this.viewH / this.viewW));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssH * dpr);
    this.scale = (width * dpr) / this.viewW;
    this.cssScale = width / this.viewW;
  }

  toWorld(e) {
    const rect = this.refs.canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / this.cssScale;
    const sy = (e.clientY - rect.top) / this.cssScale;
    return { x: sx + this.camX, y: sy + this.camY };
  }

  /** 진행 중인 실시간 구간. 끝난 뒤에도 마지막 장면을 그리도록 마지막 값을 기억한다. */
  currentRun() {
    if (this.game.run) this.lastSeenRun = this.game.run;
    return this.game.run ?? this.lastSeenRun ?? null;
  }

  input() {
    let mx = 0;
    let my = 0;
    for (const code of this.keys) {
      mx += KEY_DIRS[code][0];
      my += KEY_DIRS[code][1];
    }
    const run = this.game.run;
    if (this.pointer && run) {
      const dx = this.pointer.x - run.player.x;
      const dy = this.pointer.y - run.player.y;
      const d = Math.hypot(dx, dy);
      if (d > 12) {
        mx = dx / d;
        my = dy / d;
      }
    }
    const input = { mx, my, interact: this.pendingInteract, drop: this.pendingDrop };
    this.pendingInteract = false;
    this.pendingDrop = null;
    return input;
  }

  // ── 루프 ───────────────────────────────────

  loop(now) {
    if (this.destroyed) return;
    const game = this.game;
    if (game.phase === 'run') {
      if (this.lastFrame != null) {
        this.accumulator += Math.min(0.1, (now - this.lastFrame) / 1000) * this.timescale;
      }
      this.lastFrame = now;
      while (this.accumulator >= SIM_STEP && game.phase === 'run') {
        this.currentRun();
        game.stepRun(SIM_STEP, this.input());
        this.accumulator -= SIM_STEP;
      }
    }
    if (this.destroyed) return;
    this.draw();
    this.renderHud();
    if (!this.finishing) this.frame = requestAnimationFrame((t) => this.loop(t));
  }

  /** 실시간 구간이 끝났을 때 결과를 잠깐 보여 주고 다음 화면으로 넘긴다. */
  finish(lastRun, ending, done) {
    if (this.finishing) return;
    this.finishing = true;
    this.lastRun = lastRun;
    const home = lastRun?.outcome === 'home';
    const title = home ? (lastRun.endedBy === 'enter' ? '문을 잠그고 집에 들어갔다' : '60초가 끝났다 — 집 안으로!') : ending?.title ?? '실패';
    const detail = home
      ? `물품 ${lastRun.items.length}개 · 가족 ${lastRun.family.length}명을 집에 들였다${lastRun.endedBy === 'enter' ? ` · 남은 시간 ${lastRun.timeLeft.toFixed(1)}초` : ''}`
      : lastRun?.outcome === 'timeout'
        ? '60초가 끝났을 때 집 밖에 있었다.'
        : '좀비에게 붙잡혔다.';
    this.refs.overlay.hidden = false;
    this.refs.overlay.innerHTML = `<div class="run-result ${home ? 'good' : 'bad'}"><h2>${esc(title)}</h2><p>${esc(detail)}</p></div>`;
    this.draw();
    this.renderHud();
    setTimeout(() => {
      this.destroy();
      done();
    }, home ? 1100 : 1400);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
  }

  // ── HUD ────────────────────────────────────

  renderHud() {
    const run = this.currentRun();
    const timeLeft = run ? run.timeLeft : 60;
    const { time, timerBox, goal, home, bag, bagCount, prompt, toasts, pickBtn } = this.refs;
    time.textContent = timeLeft.toFixed(1);
    timerBox.classList.toggle('warn', timeLeft <= 20 && timeLeft > 10);
    timerBox.classList.toggle('danger', timeLeft <= 10);

    const inventory = this.game.inventory;
    const signature = inventory.items.join(',');
    if (signature !== this.bagSignature) {
      this.bagSignature = signature;
      bagCount.textContent = `${inventory.used}/${inventory.capacity}칸`;
      const cells = inventory.layout().map(
        (cell) => `<button type="button" class="bag-item ${cell.kind}" style="grid-column: span ${cell.slots}" data-index="${cell.index}" title="${esc(cell.name)} 내려놓기 (${cell.index + 1})">
            <span class="bag-key">${cell.index + 1}</span>${esc(cell.name)}<small>${cell.slots}칸</small></button>`,
      );
      for (let i = 0; i < inventory.free; i++) cells.push('<span class="bag-empty">빈칸</span>');
      bag.innerHTML = cells.join('');
    }

    // 집에 들여놓은 것
    const delivered = run?.delivered ?? [];
    const homeSig = `${delivered.join(',')}|${run?.atHome}`;
    if (homeSig !== this.homeSignature) {
      this.homeSignature = homeSig;
      const counts = {};
      for (const id of delivered) if (!isPerson(id)) counts[id] = (counts[id] ?? 0) + 1;
      const itemsText = Object.entries(counts)
        .map(([id, n]) => `${ITEMS[id].short}${n > 1 ? `×${n}` : ''}`)
        .join(' · ');
      const family = FAMILY_DEFS.map((def) => {
        const safe = delivered.includes(def.id);
        return `<span class="fam ${safe ? 'safe' : ''}" style="--c:${def.color}">${safe ? '✔' : '…'} ${esc(def.name)}</span>`;
      }).join('');
      home.innerHTML = `<span class="hud-label">집에 들여놓은 것</span><span class="home-items">${esc(itemsText || '아직 없음')}</span><span class="home-family">${family}</span>`;
    }

    if (!run) {
      goal.textContent = '목표: 물자와 가족을 집으로';
      prompt.hidden = true;
      pickBtn.disabled = true;
      return;
    }

    const toHome = Math.hypot(HOME_ZONE.x + HOME_ZONE.w / 2 - run.player.x, HOME_ZONE.y + HOME_ZONE.h / 2 - run.player.y);
    const eta = toHome / playerSpeed(run);
    if (run.atHome) goal.textContent = run.timeLeft > 0 ? '집 문간: 여기 있으면 안전하다 · 다시 나가도 된다' : '';
    else if (run.timeLeft < eta + 5) goal.textContent = `⚠ 서둘러 집으로! 집까지 약 ${eta.toFixed(1)}초`;
    else if (!inventory.isEmpty) goal.textContent = '목표: 집 앞 도착 구역으로 가져가기 (오른쪽)';
    else goal.textContent = '목표: 마트에서 물자를, 집 주변에서 가족을 데려오기';

    const preview = run.outcome ? null : pickupPreview(run);
    if (run.pickup) {
      const item = carryInfo(run.pickup.id);
      prompt.hidden = false;
      prompt.className = 'run-prompt busy';
      prompt.innerHTML = `${esc(item.name)} ${item.kind === 'person' ? '데려가는 중' : '집는 중'}…`;
    } else if (preview) {
      const { item, stock, need, free, canFit } = preview;
      const person = item.kind === 'person';
      prompt.hidden = false;
      let state;
      if (stock <= 0) state = '<em class="bad">선반이 비었다</em>';
      else if (!canFit) state = `<em class="bad">칸 부족 — ${need}칸 필요, 남은 칸 ${free}</em>`;
      else state = `<em class="ok">[E] ${person ? '데려가기' : '집기'}</em>`;
      prompt.className = 'run-prompt';
      prompt.innerHTML = person
        ? `<strong>${esc(item.name)}</strong> <span class="slots">${need}칸 필요</span> · 남은 칸 ${free} · ${esc(item.note)} ${state}`
        : `<strong>${esc(item.name)}</strong> <span class="slots">${need}칸 필요</span> · 남은 칸 ${free} · ${esc(item.note)}${preview.shelf ? ` · 남은 수량 ${stock}` : ' · 바닥에 놓인 것'} ${state}`;
    } else if (run.atHome) {
      prompt.hidden = false;
      prompt.className = 'run-prompt home';
      prompt.innerHTML = `<strong>집 문간</strong> · 가방이 비워졌다 · <em class="ok">[E] 문을 잠그고 들어가기</em> <small>남은 ${run.timeLeft.toFixed(1)}초를 쓰지 않고 끝낸다</small>`;
    } else {
      prompt.hidden = true;
    }
    const canAct = preview ? preview.stock > 0 && preview.canFit && !run.pickup : run.atHome;
    pickBtn.disabled = !canAct;
    pickBtn.innerHTML = !preview && run.atHome ? '문 잠그고 들어가기 <kbd>E</kbd>' : '줍기 <kbd>E</kbd>';

    const toastSig = run.toasts.map((t) => t.text).join('|');
    if (toastSig !== this.toastSignature) {
      this.toastSignature = toastSig;
      toasts.innerHTML = run.toasts.map((t) => `<div class="toast ${t.tone}">${esc(t.text)}</div>`).join('');
    }
  }

  // ── 그리기 ─────────────────────────────────

  draw() {
    const { ctx } = this;
    const run = this.currentRun();
    const player = run ? run.player : { ...START, r: 14, faceX: 1, faceY: 0 };
    this.camX = Math.max(0, Math.min(WORLD.w - this.viewW, player.x - this.viewW / 2));
    this.camY = Math.max(0, Math.min(WORLD.h - this.viewH, player.y - this.viewH / 2));
    if (this.viewH >= WORLD.h) this.camY = (WORLD.h - this.viewH) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, this.refs.canvas.width, this.refs.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, -this.camX * this.scale, -this.camY * this.scale);

    this.drawWorld(run);
    const preview = run && !run.outcome ? pickupPreview(run) : null;
    this.drawShelves(run, preview);
    this.drawGround(run, preview);
    if (run) for (const z of run.zombies) this.drawZombie(z);
    this.drawPlayer(run, player);

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawObjectiveArrow(run, player);
    this.drawMinimap(run, player);
  }

  drawWorld() {
    const { ctx } = this;
    ctx.fillStyle = COLORS.street;
    ctx.fillRect(MART.x + MART.w, 0, WORLD.w - MART.x - MART.w, WORLD.h);
    ctx.strokeStyle = COLORS.lane;
    ctx.lineWidth = 4;
    ctx.setLineDash([36, 28]);
    ctx.beginPath();
    ctx.moveTo(MART.x + MART.w + 20, 360);
    ctx.lineTo(HOUSE.x - 80, 360);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.martFloor;
    ctx.fillRect(MART.x, MART.y, MART.w, MART.h);
    ctx.fillStyle = COLORS.wall;
    for (const w of WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = COLORS.door;
    for (const door of MART_DOORS) {
      const g = door.gap;
      if (g.w < g.h) ctx.fillRect(g.x + g.w / 2 - 2, g.y, 4, g.h);
      else ctx.fillRect(g.x, g.y + g.h / 2 - 2, g.w, 4);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('대형 마트', MART.x + 150, MART.y - 14);
    ctx.fillText('정문 →', MART.x + MART.w + 40, 292);

    for (const car of CARS) {
      ctx.fillStyle = COLORS.car;
      ctx.fillRect(car.x, car.y, car.w, car.h);
      ctx.fillStyle = COLORS.carGlass;
      if (car.w > car.h) ctx.fillRect(car.x + car.w * 0.3, car.y + 8, car.w * 0.35, car.h - 16);
      else ctx.fillRect(car.x + 8, car.y + car.h * 0.3, car.w - 16, car.h * 0.35);
    }

    ctx.fillStyle = COLORS.homeZone;
    ctx.fillRect(HOME_ZONE.x - 8, HOME_ZONE.y, HOME_ZONE.w + 8, HOME_ZONE.h);
    ctx.fillStyle = COLORS.house;
    ctx.fillRect(HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h);
    ctx.strokeStyle = COLORS.roof;
    ctx.lineWidth = 8;
    ctx.strokeRect(HOUSE.x + 4, HOUSE.y + 4, HOUSE.w - 8, HOUSE.h - 8);
    ctx.fillStyle = COLORS.door;
    ctx.fillRect(HOUSE.x - 4, HOME_ZONE.y + 10, 8, HOME_ZONE.h - 20);
    ctx.fillStyle = COLORS.label;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('집', HOUSE.x + HOUSE.w / 2, HOUSE.y + HOUSE.h / 2 + 9);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#9fe0a8';
    ctx.fillText('도착', HOME_ZONE.x + HOME_ZONE.w / 2 - 4, HOME_ZONE.y - 8);
    ctx.textAlign = 'left';
  }

  drawShelves(run, preview) {
    const { ctx } = this;
    for (const rack of RACKS) {
      ctx.fillStyle = COLORS.rack;
      ctx.fillRect(rack.x, rack.y, rack.w, rack.h);
      ctx.strokeStyle = COLORS.rackEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(rack.x + 1, rack.y + 1, rack.w - 2, rack.h - 2);
    }
    const stockOf = (shelf) => (run ? run.martStock[shelf.id] : this.game.martStock[shelf.id]) ?? 0;
    ctx.textAlign = 'center';
    for (const shelf of SHELVES) {
      const item = ITEMS[shelf.itemId];
      const stock = stockOf(shelf);
      const active = preview?.shelf?.id === shelf.id;
      const w = 66;
      const h = 34;
      ctx.globalAlpha = stock > 0 ? 1 : 0.45;
      ctx.fillStyle = active ? '#3b3420' : 'rgba(20, 20, 22, 0.86)';
      ctx.fillRect(shelf.x - w / 2, shelf.y - h / 2, w, h);
      ctx.strokeStyle = active ? COLORS.highlight : item.slots > 1 ? '#c98b4a' : '#7d8a96';
      ctx.lineWidth = active ? 3 : 1.5;
      ctx.strokeRect(shelf.x - w / 2, shelf.y - h / 2, w, h);
      ctx.fillStyle = COLORS.label;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(item.short, shelf.x, shelf.y - 2);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = item.slots > 1 ? '#f0b072' : '#b9c4cf';
      ctx.fillText(stock > 0 ? `${item.slots}칸 ×${stock}` : '비었음', shelf.x, shelf.y + 12);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  /** 바닥에 있는 것: 집 주변에 숨은 가족, 내려놓은 물건 */
  drawGround(run, preview) {
    const { ctx } = this;
    const ground = run
      ? run.ground
      : FAMILY_DEFS.map((def) => ({ uid: def.id, id: def.id, ...FAMILY_SPOTS[def.id] }));
    ctx.textAlign = 'center';
    for (const g of ground) {
      const info = carryInfo(g.id);
      const active = preview?.target.kind === 'ground' && preview.target.ground === g;
      if (info.kind === 'person') {
        ctx.fillStyle = info.color;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = active ? COLORS.highlight : '#ffffff';
        ctx.lineWidth = active ? 4 : 2;
        ctx.stroke();
        ctx.fillStyle = COLORS.label;
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(info.name, g.x, g.y - 22);
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#f0b072';
        ctx.fillText(`${info.slots}칸`, g.x, g.y + 28);
        // 도와 달라는 손짓
        const wave = Math.sin(performance.now() / 220 + g.x) * 4;
        ctx.strokeStyle = info.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(g.x + 10, g.y - 4);
        ctx.lineTo(g.x + 20, g.y - 14 + wave);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20, 20, 22, 0.9)';
        ctx.fillRect(g.x - 28, g.y - 12, 56, 24);
        ctx.strokeStyle = active ? COLORS.highlight : '#c98b4a';
        ctx.lineWidth = active ? 3 : 1.5;
        ctx.strokeRect(g.x - 28, g.y - 12, 56, 24);
        ctx.fillStyle = COLORS.label;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(info.short, g.x, g.y + 4);
      }
    }
    // 집에 들여놓은 가족은 문 옆에 작게 보여 준다
    if (run) {
      const safe = run.delivered.filter(isPerson);
      safe.forEach((id, i) => {
        const info = carryInfo(id);
        ctx.fillStyle = info.color;
        ctx.beginPath();
        ctx.arc(HOUSE.x + 40 + i * 34, HOUSE.y + HOUSE.h - 30, 10, 0, Math.PI * 2);
        ctx.fill();
      });
      const items = run.delivered.filter((id) => !isPerson(id)).length;
      if (items) {
        ctx.fillStyle = '#9fe0a8';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`물품 ${items}개`, HOUSE.x + HOUSE.w / 2, HOUSE.y + 40);
      }
    }
    ctx.textAlign = 'left';
  }

  drawZombie(z) {
    const { ctx } = this;
    ctx.fillStyle = z.chasing ? COLORS.zombieChase : COLORS.zombie;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = z.chasing ? COLORS.danger : '#2f4a22';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = z.chasing ? COLORS.danger : '#20301a';
    ctx.fillRect(z.x - 5, z.y - 3, 3, 3);
    ctx.fillRect(z.x + 2, z.y - 3, 3, 3);
  }

  drawPlayer(run, p) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const len = Math.hypot(p.faceX, p.faceY) || 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x + (p.faceX / len) * 7, p.y + (p.faceY / len) * 7, 3, 0, Math.PI * 2);
    ctx.fill();
    if (run?.pickup) {
      ctx.strokeStyle = COLORS.highlight;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * run.pickup.t) / run.pickup.duration);
      ctx.stroke();
    }
  }

  drawObjectiveArrow(run, p) {
    if (!run || run.atHome) return;
    const target = { x: HOME_ZONE.x + HOME_ZONE.w / 2, y: HOME_ZONE.y + HOME_ZONE.h / 2, label: '집' };
    const sx = target.x - this.camX;
    const sy = target.y - this.camY;
    if (sx > 20 && sx < this.viewW - 20 && sy > 20 && sy < this.viewH - 20) return;
    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ax = Math.max(40, Math.min(this.viewW - 40, cx + Math.cos(angle) * (this.viewW / 2 - 40)));
    const ay = Math.max(40, Math.min(this.viewH - 40, cy + Math.sin(angle) * (this.viewH / 2 - 40)));
    const { ctx } = this;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255, 211, 77, 0.92)';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const distance = Math.round(Math.hypot(target.x - p.x, target.y - p.y) / 10);
    ctx.fillText(`${target.label} ${distance}m`, ax, ay + (ay > this.viewH / 2 ? -22 : 32));
    ctx.textAlign = 'left';
  }

  drawMinimap(run, p) {
    const { ctx } = this;
    const w = 240;
    const h = (w * WORLD.h) / WORLD.w;
    const x0 = this.viewW - w - 12;
    const y0 = 12;
    const s = w / WORLD.w;
    ctx.fillStyle = 'rgba(10, 11, 13, 0.78)';
    ctx.fillRect(x0 - 4, y0 - 4, w + 8, h + 8);
    ctx.fillStyle = COLORS.martFloor;
    ctx.fillRect(x0 + MART.x * s, y0 + MART.y * s, MART.w * s, MART.h * s);
    ctx.fillStyle = COLORS.car;
    for (const c of CARS) ctx.fillRect(x0 + c.x * s, y0 + c.y * s, c.w * s, c.h * s);
    ctx.fillStyle = COLORS.house;
    ctx.fillRect(x0 + HOUSE.x * s, y0 + HOUSE.y * s, HOUSE.w * s, HOUSE.h * s);
    if (run) {
      for (const z of run.zombies) {
        ctx.fillStyle = z.chasing ? COLORS.danger : COLORS.zombie;
        ctx.fillRect(x0 + z.x * s - 1.5, y0 + z.y * s - 1.5, 3, 3);
      }
    }
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(x0 + p.x * s, y0 + p.y * s, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + this.camX * s, y0 + this.camY * s, this.viewW * s, this.viewH * s);
    if (run) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px sans-serif';
      const chasing = run.zombies.filter((z) => z.chasing).length;
      ctx.fillText(`좀비 ${run.zombies.length} · 추격 중 ${chasing}${inMart(p) ? ' · 마트 안' : ''}`, x0, y0 + h + 16);
      ctx.fillText(`시야 ${Math.round(zombieSight(run) / 10)}m`, x0 + w - 56, y0 + h + 16);
    }
  }
}
