// Bottom-center transport bar with circular icon buttons using SVG icons.
// Fades in on mouse activity, fades out after idle.

const ICON_PATH = `${import.meta.env.BASE_URL}assets/UI`;

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
  private tooltipEl: HTMLDivElement;
  private tooltipTimers: number[] = [];

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
        this.dismissTooltip();
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

    // Tooltip element
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'transport-tooltip';
    document.body.appendChild(this.tooltipEl);

    document.body.appendChild(this.root);
    this.injectStyles();

    window.addEventListener('mousemove', () => this.onMouseActivity());
    window.addEventListener('touchstart', () => this.onMouseActivity(), { passive: true });

    this.showOnboardingHints();
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

  private showOnboardingHints(): void {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Show play hint immediately
    this.showTooltipOn('play', isMobile ? 'Tap to play' : 'Press Space or click to play');

    // After a delay, show randomize hint
    this.tooltipTimers.push(window.setTimeout(() => {
      this.showTooltipOn('randomize', isMobile
        ? 'Tap to randomize \u2022 Two-finger tap anywhere'
        : 'Press R or right-click to randomize');
    }, 6000));

    // Auto-dismiss all hints after a while
    this.tooltipTimers.push(window.setTimeout(() => {
      this.dismissTooltip();
    }, 12000));
  }

  private showTooltipOn(buttonId: string, text: string): void {
    const btn = this.buttons.get(buttonId);
    if (!btn) return;

    // Make transport visible while showing tooltip
    this.root.classList.add('visible');

    // Collapse current tooltip first if visible, then show new one
    this.tooltipEl.classList.remove('visible');

    // Small delay so the collapse transition can start before repositioning
    requestAnimationFrame(() => {
      this.tooltipEl.textContent = text;

      // Position above the button, anchored to its center
      const rect = btn.getBoundingClientRect();
      const left = rect.left + rect.width / 2;
      const bottom = window.innerHeight - rect.top + 12;
      this.tooltipEl.style.left = `${left}px`;
      this.tooltipEl.style.bottom = `${bottom}px`;
      // Scale from the bottom center (where the arrow points)
      this.tooltipEl.style.transformOrigin = 'center bottom';

      // Force reflow so the browser sees the collapsed state before expanding
      void this.tooltipEl.offsetHeight;
      this.tooltipEl.classList.add('visible');
    });
  }

  private dismissTooltip(): void {
    this.tooltipEl.classList.remove('visible');
    for (const t of this.tooltipTimers) clearTimeout(t);
    this.tooltipTimers.length = 0;
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

.transport-tooltip {
  position: fixed;
  left: 0; bottom: 0;
  transform: translateX(-50%) scale(0);
  padding: 8px 16px;
  background: rgba(255,255,255,0.95);
  color: #1a1a2a;
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 41;
  opacity: 0;
  transform-origin: center bottom;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.15);
}
.transport-tooltip::after {
  content: '';
  position: absolute;
  bottom: -7px;
  left: 50%;
  transform: translateX(-50%);
  width: 14px; height: 7px;
  background: rgba(255,255,255,0.95);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
}
.transport-tooltip.visible {
  transform: translateX(-50%) scale(1);
  opacity: 1;
}
`;
    document.head.appendChild(s);
  }
}
