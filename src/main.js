// 화면 전환과 입력 연결. 규칙은 src/core 에 있다.
//
// URL 옵션
//   ?seed=123456      같은 시드로 시작(사건 배치 재현)
//   ?difficulty=hard  시작 화면의 난이도 기본 선택(easy | hard | apocalypse)
//   ?debug=1          window.game 으로 게임 상태 노출
//   ?timescale=2      실시간 구간 속도 배율(검증용)
//   ?zombies=off      좀비 없이(흐름 확인용)
import { RUN_SECONDS } from './core/constants.js';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from './core/difficulty.js';
import { Game } from './core/game.js';
import { randomSeed } from './core/rng.js';
import { RunView } from './ui/runView.js';
import { renderEnding, renderHome, renderTitle } from './ui/screens.js';

// 결말 도감: 본 결말 id 목록을 이 브라우저에만 저장한다(저장소를 못 쓰면 이번 방문 동안만 기억).
const CODEX_KEY = 'mart60.endings';
const codex = {
  memory: new Set(),
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(CODEX_KEY) ?? '[]');
      if (Array.isArray(saved)) for (const id of saved) this.memory.add(id);
    } catch {
      /* 저장소를 쓸 수 없는 환경 */
    }
    return [...this.memory];
  },
  /** 새로 본 결말이면 true */
  add(id) {
    const fresh = !this.load().includes(id);
    this.memory.add(id);
    try {
      localStorage.setItem(CODEX_KEY, JSON.stringify([...this.memory]));
    } catch {
      /* 저장하지 못해도 게임은 계속된다 */
    }
    return fresh;
  },
};

const TITLE = `마트 탈출 ${RUN_SECONDS}초`;
const params = new URLSearchParams(location.search);
const OPTIONS = {
  seed: params.get('seed') ? Number(params.get('seed')) : null,
  difficulty: DIFFICULTIES[params.get('difficulty')] ? params.get('difficulty') : DEFAULT_DIFFICULTY,
  debug: params.has('debug'),
  timescale: Math.max(0.25, Math.min(8, Number(params.get('timescale')) || 1)),
  zombies: params.get('zombies') !== 'off',
};

class App {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.runView = null;
    this.unsubscribe = null;
    this.ui = { expedition: { memberId: null, withWeapon: false }, page: null };
    this.difficulty = OPTIONS.difficulty;
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('submit', (e) => this.onSubmit(e));
    this.showTitle(OPTIONS.seed);
  }

  showTitle(seed = null) {
    this.teardown();
    this.game = null;
    this.root.innerHTML = renderTitle({ seed, difficulty: this.difficulty, discovered: codex.load() });
    document.title = TITLE;
  }

  newGame(seed) {
    this.teardown();
    this.ui.expedition = { memberId: null, withWeapon: false };
    this.ui.page = null;
    this.game = new Game({
      seed: Number.isFinite(seed) && seed > 0 ? seed : randomSeed(),
      zombies: OPTIONS.zombies,
      difficulty: this.difficulty,
    });
    if (OPTIONS.debug) window.game = this.game;
    this.unsubscribe = this.game.subscribe(() => this.render());
    this.render();
  }

  teardown() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.runView?.destroy();
    this.runView = null;
  }

  render() {
    const game = this.game;
    if (!game) return;
    if (game.phase === 'ready' || game.phase === 'run') {
      if (!this.runView) {
        this.runView = new RunView({ root: this.root, game, timescale: OPTIONS.timescale });
        window.scrollTo(0, 0);
      }
      return;
    }
    if (this.runView) {
      // 결과를 잠깐 보여 준 뒤 다음 화면으로
      const view = this.runView;
      view.finish(game.lastRun, game.ending, () => {
        if (this.runView === view) this.runView = null;
        this.renderScreen();
        window.scrollTo(0, 0);
      });
      return;
    }
    this.renderScreen();
  }

  renderScreen() {
    const game = this.game;
    if (!game || this.runView) return;
    if (game.phase === 'home') this.root.innerHTML = renderHome(game, this.ui);
    else if (game.phase === 'ending') {
      if (this.recordedEnding !== game) {
        // 결말은 게임마다 한 번만 도감에 적는다
        this.recordedEnding = game;
        this.newEnding = codex.add(game.ending.id);
      }
      this.root.innerHTML = renderEnding(game, { discovered: codex.load(), isNew: this.newEnding });
    }
    document.title = game.phase === 'home' ? `${game.day}일차 · ${TITLE}` : TITLE;
  }

  onSubmit(e) {
    const form = e.target.closest('[data-form="start"]');
    if (!form) return;
    e.preventDefault();
    const data = new FormData(form);
    const value = data.get('seed');
    if (DIFFICULTIES[data.get('difficulty')]) this.difficulty = data.get('difficulty');
    this.newGame(value ? Number(value) : null);
  }

  onChange(e) {
    if (e.target.name === 'difficulty' && !this.game) {
      this.difficulty = e.target.value;
      for (const el of this.root.querySelectorAll('.level')) el.classList.toggle('on', el.contains(e.target));
      return;
    }
    const draft = e.target.closest('[data-draft]');
    if (draft && this.game) {
      const key = draft.dataset.draft;
      this.ui.expedition[key] = draft.type === 'checkbox' ? draft.checked : draft.value;
      this.renderScreen();
      return;
    }
    const el = e.target.closest('[data-action="ration"]');
    if (!el || !this.game) return;
    if (!this.game.setRation(el.dataset.person, el.dataset.kind, el.checked)) {
      el.checked = !el.checked;
      this.flash('재고가 부족하다');
    }
  }

  onClick(e) {
    const el = e.target.closest('button[data-action]');
    if (!el || el.disabled) return;
    const game = this.game;
    const { action, person, option } = el.dataset;
    switch (action) {
      case 'choose': {
        const result = game.chooseOption(option);
        if (!result.ok) this.flash(result.reason);
        break;
      }
      case 'med':
        game.useMed(person);
        break;
      case 'mom-care':
        game.momCare(person);
        break;
      case 'talk':
        game.talk(person);
        break;
      case 'page': {
        // 일지 넘기기: 지난 쪽을 펼쳐 본다(빈 값이면 오늘 쪽)
        this.ui.page = el.dataset.page ? Number(el.dataset.page) : null;
        this.renderScreen();
        this.root.querySelector('[data-ref="diary"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        break;
      }
      case 'ration-all':
        game.setAllRations(true);
        break;
      case 'ration-none':
        game.setAllRations(false);
        break;
      case 'send-expedition': {
        const draft = this.ui.expedition;
        game.sendExpedition({ memberId: person, withWeapon: draft.withWeapon });
        break;
      }
      case 'end-day':
        this.ui.page = null;
        game.endDay();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'restart':
        if (confirm('지금 게임을 버리고 처음 화면으로 돌아갈까요?')) this.showTitle();
        break;
      case 'new-game':
        this.showTitle(); // 난이도를 다시 고를 수 있게 시작 화면으로
        break;
      case 'same-seed':
        this.newGame(game.seed);
        break;
      default:
        break;
    }
  }

  flash(text) {
    const note = document.createElement('div');
    note.className = 'flash';
    note.textContent = text;
    document.body.append(note);
    setTimeout(() => note.remove(), 2200);
  }
}

new App(document.getElementById('app'));
