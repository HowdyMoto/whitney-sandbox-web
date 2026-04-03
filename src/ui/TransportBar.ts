// Bottom-center transport bar with circular icon buttons using SVG icons.
// Fades in on mouse activity, fades out after idle.

const ICON_PATH = '/assets/UI';

function icon(name: string): string {
  return `<img src="${ICON_PATH}/${name}.svg" alt="" draggable="false">`;
}

export interface TransportCallbacks {
  onPlayPause: () => void;
  onMute: () => void;
  onKeyboard: () => void;
  onRandomize: () => void;
  onPerfToggle: () => void;
}

export interface TransportState {
  isPlaying: boolean;
  soundEnabled: boolean;
  keyboardVisible: boolean;
  perfVisible: boolean;
}

export class TransportBar {
  private root: HTMLDivElement;
  private buttons: Map<string, HTMLButtonElement> = new Map();
  private mouseIdleTimeout = 0;

  constructor(callbacks: TransportCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'transport-bar';

    const btnDefs: { id: string; tooltip: string; cb: () => void }[] = [
      { id: 'play',      tooltip: 'Play / Pause (Space)', cb: callbacks.onPlayPause },
      { id: 'mute',      tooltip: 'Mute (M)',             cb: callbacks.onMute },
      { id: 'keyboard',  tooltip: 'Piano Keyboard (K)',   cb: callbacks.onKeyboard },
      { id: 'randomize', tooltip: 'Randomize (R)',        cb: callbacks.onRandomize },
      { id: 'perf',      tooltip: 'Performance Stats',    cb: callbacks.onPerfToggle },
    ];

    for (const def of btnDefs) {
      const btn = document.createElement('button');
      btn.className = 'transport-btn';
      btn.title = def.tooltip;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        def.cb();
      });
      this.buttons.set(def.id, btn);
      this.root.appendChild(btn);
    }

    // Set icons (toggles keep the same icon, use .off class for dimming)
    this.buttons.get('play')!.innerHTML = icon('play');
    this.buttons.get('mute')!.innerHTML = icon('speaker');
    this.buttons.get('keyboard')!.innerHTML = icon('keyboard');
    this.buttons.get('randomize')!.innerHTML = icon('dice');
    this.buttons.get('perf')!.innerHTML = icon('info');

    // Keyboard and perf start off
    this.buttons.get('keyboard')!.classList.add('off');
    this.buttons.get('perf')!.classList.add('off');

    document.body.appendChild(this.root);
    this.injectStyles();

    window.addEventListener('mousemove', () => this.onMouseActivity());
    window.addEventListener('touchstart', () => this.onMouseActivity(), { passive: true });
  }

  update(state: TransportState): void {
    // All toggles: same icon, dim when off
    this.buttons.get('play')!.classList.toggle('off', !state.isPlaying);
    this.buttons.get('mute')!.classList.toggle('off', !state.soundEnabled);
    this.buttons.get('keyboard')!.classList.toggle('off', !state.keyboardVisible);
    this.buttons.get('perf')!.classList.toggle('off', !state.perfVisible);
  }

  setBottomOffset(px: number): void {
    this.root.style.bottom = `${20 + px}px`;
  }

  private onMouseActivity(): void {
    this.root.classList.add('visible');
    clearTimeout(this.mouseIdleTimeout);
    this.mouseIdleTimeout = window.setTimeout(() => {
      this.root.classList.remove('visible');
    }, 2500);
  }

  private injectStyles(): void {
    if (document.getElementById('transport-styles')) return;
    const s = document.createElement('style');
    s.id = 'transport-styles';
    s.textContent = `
.transport-bar {
  position: fixed;
  bottom: 20px;
  left: 50%; transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,0.08);
  z-index: 40;
  opacity: 0;
  transition: opacity 0.4s, bottom 0.3s;
  pointer-events: none;
}
.transport-bar.visible {
  opacity: 1;
  pointer-events: auto;
}

.transport-btn {
  position: relative;
  width: 44px; height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.07);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, opacity 0.15s;
  padding: 0;
}
.transport-btn img {
  width: 24px; height: 24px;
  opacity: 1.0;
  transition: opacity 0.15s;
  pointer-events: none;
}
.transport-btn:hover {
  background: rgba(255,255,255,0.2);
}
.transport-btn:active {
  background: rgba(255,255,255,0.28);
}
.transport-btn.off {
  background: rgba(255,255,255,0.03);
}
.transport-btn.off img {
  opacity: 0.2;
}
.transport-btn.off:hover {
  background: rgba(255,255,255,0.1);
}
.transport-btn.off:hover img {
  opacity: 0.5;
}
`;
    document.head.appendChild(s);
  }
}
