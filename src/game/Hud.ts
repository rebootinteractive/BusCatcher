export interface HudCallbacks {
  onRestart: () => void;
  onMenu: () => void;
}

export class Hud {
  readonly root: HTMLDivElement;
  private busEl: HTMLDivElement;
  private deckEl: HTMLDivElement;
  private modalEl: HTMLDivElement | null = null;

  constructor(parent: HTMLElement, levelName: string, private cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';

    const top = document.createElement('div');
    top.className = 'hud-top';

    const left = document.createElement('div');
    const back = document.createElement('button');
    back.className = 'btn ghost small';
    back.textContent = '← Levels';
    back.addEventListener('click', () => cb.onMenu());
    left.appendChild(back);

    const center = document.createElement('div');
    this.busEl = document.createElement('div');
    this.busEl.className = 'hud-timer';
    this.busEl.textContent = '🚌 0';
    center.appendChild(this.busEl);

    const right = document.createElement('div');
    this.deckEl = document.createElement('div');
    this.deckEl.className = 'hud-counter';
    this.deckEl.innerHTML = `Deck <strong>0</strong>/0`;
    right.appendChild(this.deckEl);

    top.appendChild(left);
    top.appendChild(center);
    top.appendChild(right);

    const bottom = document.createElement('div');
    bottom.className = 'hud-bottom';
    const restart = document.createElement('button');
    restart.className = 'btn ghost small';
    restart.textContent = '↻ Restart';
    restart.addEventListener('click', () => cb.onRestart());
    bottom.appendChild(restart);

    const levelTag = document.createElement('div');
    levelTag.style.color = '#8b91a6';
    levelTag.style.fontSize = '12px';
    levelTag.style.alignSelf = 'center';
    levelTag.textContent = levelName;
    bottom.appendChild(levelTag);

    this.root.appendChild(top);
    this.root.appendChild(bottom);
    parent.appendChild(this.root);
  }

  setBusCount(remaining: number) {
    this.busEl.textContent = `🚌 ${remaining}`;
  }

  setDeck(used: number, total: number) {
    this.deckEl.innerHTML = `Deck <strong>${used}</strong>/${total}`;
    this.deckEl.style.color = used >= total ? '#ff6b6b' : '';
  }

  showWin() {
    this.showModal({ kind: 'win', title: 'All Aboard!', sub: 'Every bus left full.' });
  }

  showLose() {
    this.showModal({ kind: 'lose', title: 'Deck Overflow', sub: 'No room left in the waiting deck.' });
  }

  private showModal(opts: { kind: 'win' | 'lose'; title: string; sub: string }) {
    this.dismissModal();
    const modal = document.createElement('div');
    modal.className = 'modal';

    const card = document.createElement('div');
    card.className = `modal-card endgame ${opts.kind}`;

    const h = document.createElement('h1');
    h.textContent = opts.title;
    const p = document.createElement('p');
    p.textContent = opts.sub;
    card.appendChild(h);
    card.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn ghost';
    menuBtn.textContent = 'Menu';
    menuBtn.addEventListener('click', () => this.cb.onMenu());
    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn';
    restartBtn.textContent = opts.kind === 'win' ? 'Play Again' : 'Try Again';
    restartBtn.addEventListener('click', () => {
      this.dismissModal();
      this.cb.onRestart();
    });
    actions.appendChild(menuBtn);
    actions.appendChild(restartBtn);
    card.appendChild(actions);

    modal.appendChild(card);
    this.root.appendChild(modal);
    this.modalEl = modal;
  }

  private dismissModal() {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }

  dispose() {
    this.dismissModal();
    this.root.remove();
  }
}
