// Upper-right FPS / performance stats overlay.

export class PerfOverlay {
  private root: HTMLDivElement;
  private fpsEl: HTMLSpanElement;
  private frameTimeEl: HTMLSpanElement;
  private dotsEl: HTMLSpanElement;
  private particlesEl: HTMLSpanElement;
  private visible = false;

  // FPS tracking
  private frameTimes: number[] = [];
  private lastTime = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'perf-overlay';

    this.fpsEl = document.createElement('span');
    this.frameTimeEl = document.createElement('span');
    this.dotsEl = document.createElement('span');
    this.particlesEl = document.createElement('span');

    this.root.appendChild(this.fpsEl);
    this.root.appendChild(this.frameTimeEl);
    this.root.appendChild(this.dotsEl);
    this.root.appendChild(this.particlesEl);

    document.body.appendChild(this.root);
    this.injectStyles();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('visible', this.visible);
  }

  isVisible(): boolean { return this.visible; }

  update(dotCount: number, particleCount: number): void {
    if (!this.visible) return;

    const now = performance.now();
    if (this.lastTime > 0) {
      const dt = now - this.lastTime;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
    }
    this.lastTime = now;

    // Compute stats every ~15 frames to avoid thrashing the DOM
    if (this.frameTimes.length > 0 && this.frameTimes.length % 15 === 0) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      const fps = 1000 / avg;
      this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
      this.frameTimeEl.textContent = `${avg.toFixed(1)} ms`;
      this.dotsEl.textContent = `${dotCount} dots`;
      this.particlesEl.textContent = `${particleCount} particles`;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('perf-styles')) return;
    const s = document.createElement('style');
    s.id = 'perf-styles';
    s.textContent = `
.perf-overlay {
  position: fixed;
  top: 12px; right: 14px;
  display: none;
  flex-direction: column;
  gap: 2px;
  font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  text-align: right;
  pointer-events: none;
  z-index: 40;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
}
.perf-overlay.visible {
  display: flex;
}
.perf-overlay span:first-child {
  font-size: 14px;
  color: rgba(255,255,255,0.7);
  font-weight: 600;
}
`;
    document.head.appendChild(s);
  }
}
