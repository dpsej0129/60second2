// 화면 전환과 입력 연결. 규칙은 src/core 에 있다.
//
// URL 옵션
//   ?seed=123456      같은 시드로 시작(사건 배치 재현)
//   ?debug=1          window.game 으로 게임 상태 노출
//   ?timescale=2      실시간 구간 속도 배율(검증용)
//   ?zombies=off      좀비 없이(흐름 확인용)
import { Game } from './core/game.js';
import { randomSeed } from './core/rng.js';
import { RunView } from './ui/runView.js';
import { renderEnding, renderFamily, renderHome, renderTitle } from './ui/screens.js';

const params = new URLSearchParams(location.search);
const OPTIONS = {
  seed: params.get('seed') ? Number(params.get('seed')) : null,
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
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('submit', (e) => this.onSubmit(e));
    this.showTitle(OPTIONS.seed);
  }

  showTitle(seed = null) {
    this.teardown();
    this.game = null;
    this.root.innerHTML = renderTitle({ seed });
    document.title = '마트 탈출 60초';
  }

  newGame(seed) {
    this.teardown();
    this.game = new Game({ seed: Number.isFinite(seed) && seed > 0 ? seed : randomSeed(), zombies: OPTIONS.zombies });
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
    if (game.phase === 'family') this.root.innerHTML = renderFamily(game);
    else if (game.phase === 'home') this.root.innerHTML = renderHome(game);
    else if (game.phase === 'ending') this.root.innerHTML = renderEnding(game);
    document.title = game.phase === 'home' ? `${game.day}일차 · 마트 탈출 60초` : '마트 탈출 60초';
  }

  onSubmit(e) {
    const form = e.target.closest('[data-form="start"]');
    if (!form) return;
    e.preventDefault();
    const value = new FormData(form).get('seed');
    this.newGame(value ? Number(value) : null);
  }

  onChange(e) {
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
    const { action, person, option, index } = el.dataset;
    switch (action) {
      case 'family':
        game.decideFamily(person, el.dataset.bring === '1');
        break;
      case 'choose': {
        const result = game.chooseOption(option);
        if (!result.ok) this.flash(result.reason);
        break;
      }
      case 'deposit':
        game.deposit(Number(index));
        break;
      case 'deposit-all':
        game.depositAll();
        break;
      case 'med':
        game.useMed(person);
        break;
      case 'mom-care':
        game.momCare(person);
        break;
      case 'ration-all':
        game.setAllRations(true);
        break;
      case 'ration-none':
        game.setAllRations(false);
        break;
      case 'supply':
        game.startSupplyRun();
        break;
      case 'end-day':
        game.endDay();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'restart':
        if (confirm('지금 게임을 버리고 처음 화면으로 돌아갈까요?')) this.showTitle();
        break;
      case 'new-game':
        this.newGame(null);
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
