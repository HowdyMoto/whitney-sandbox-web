export class SplashModal {
  private root: HTMLDivElement;
  private onDismiss: (() => void) | null = null;
  private animationFrameId = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'splash-modal';
    this.root.innerHTML = `
      <div class="splash-content">
        <h1>Whitney Music Sandbox</h1>
        <p class="subtitle">A celebration of musical and mathematical harmony</p>
        <p class="credit">
          Inspired by Jim Bumgardner's <a href="https://www.whitneymusicbox.org" target="_blank" rel="noopener noreferrer">Whitney Music Box</a>
        </p>
        <div class="button-container">
          <canvas id="orbit-canvas" width="120" height="120"></canvas>
          <button class="splash-button">Start</button>
        </div>
      </div>
    `;

    const btn = this.root.querySelector('.splash-button') as HTMLButtonElement;
    btn.addEventListener('click', () => this.dismiss());
    this.root.addEventListener('click', (e) => {
      // Allow clicking anywhere on the modal to dismiss
      if (e.target === this.root) this.dismiss();
    });

    document.body.appendChild(this.root);
    this.injectStyles();
    this.startOrbitAnimation();
  }

  onDismissed(callback: () => void): void {
    this.onDismiss = callback;
  }

  private startOrbitAnimation(): void {
    const canvas = this.root.querySelector('#orbit-canvas') as HTMLCanvasElement;
    const button = this.root.querySelector('.splash-button') as HTMLButtonElement;
    if (!canvas || !button) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Colorful palette
    const colors = [
      'rgba(168, 230, 255, 0.9)',  // cyan
      'rgba(255, 135, 210, 0.9)',  // pink
      'rgba(167, 255, 167, 0.9)',  // green
      'rgba(255, 200, 100, 0.9)',  // orange
      'rgba(200, 150, 255, 0.9)',  // purple
    ];

    const dots = colors.map((color, i) => ({
      color,
      speed: 0.3 + (i * 0.15),
      t: (i / colors.length),
    }));

    const dotRadius = 4;

    const animate = () => {
      // Get button position relative to canvas on each frame
      const btnRect = button.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      const padding = 2; // Padding to keep dots visible
      const left = btnRect.left - canvasRect.left + padding;
      const top = btnRect.top - canvasRect.top + padding;
      const right = left + btnRect.width - 2 * padding;
      const bottom = top + btnRect.height - 2 * padding;
      const btnWidth = btnRect.width - 2 * padding;
      const btnHeight = btnRect.height - 2 * padding;
      const perimeter = 2 * (btnWidth + btnHeight);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const dot of dots) {
        dot.t += dot.speed / perimeter;
        const t = dot.t % 1;
        const distance = t * perimeter;

        let x, y;
        if (distance < btnWidth) {
          // Top edge: left to right
          x = left + distance;
          y = top;
        } else if (distance < btnWidth + btnHeight) {
          // Right edge: top to bottom
          x = right;
          y = top + (distance - btnWidth);
        } else if (distance < 2 * btnWidth + btnHeight) {
          // Bottom edge: right to left
          x = right - (distance - btnWidth - btnHeight);
          y = bottom;
        } else {
          // Left edge: bottom to top
          x = left;
          y = bottom - (distance - 2 * btnWidth - btnHeight);
        }

        ctx.fillStyle = dot.color;
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  private dismiss(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.root.classList.add('dismissing');
    setTimeout(() => {
      this.root.remove();
      this.onDismiss?.();
    }, 300);
  }

  private injectStyles(): void {
    if (document.getElementById('splash-modal-styles')) return;
    const s = document.createElement('style');
    s.id = 'splash-modal-styles';
    s.textContent = `
.splash-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(20,10,40,0.98) 0%, rgba(10,30,50,0.98) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 1;
  transition: opacity 0.3s ease-out;
}

.splash-modal.dismissing {
  opacity: 0;
}

.splash-content {
  text-align: center;
  color: white;
  font-family: 'Outfit', system-ui, sans-serif;
  max-width: 400px;
  padding: 40px;
}

.splash-content h1 {
  font-size: 48px;
  font-weight: 300;
  letter-spacing: 3px;
  margin: 0 0 12px 0;
  background: linear-gradient(135deg, #a8e6ff 0%, #ff87d2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.splash-content .subtitle {
  font-size: 16px;
  font-weight: 300;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 32px 0;
}

.splash-content .credit {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 24px 0 32px 0;
  line-height: 1.6;
}

.button-container {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

#orbit-canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.splash-content a {
  color: rgba(168, 230, 255, 0.8);
  text-decoration: none;
  border-bottom: 1px solid rgba(168, 230, 255, 0.4);
  transition: color 0.2s, border-color 0.2s;
}

.splash-content a:hover {
  color: rgba(168, 230, 255, 1);
  border-bottom-color: rgba(168, 230, 255, 0.8);
}

.splash-button {
  padding: 12px 40px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 1px;
  color: white;
  background: linear-gradient(135deg, rgba(168, 230, 255, 0.2) 0%, rgba(255, 135, 210, 0.2) 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-family: 'Outfit', system-ui, sans-serif;
  text-transform: uppercase;
}

.splash-button:hover {
  background: linear-gradient(135deg, rgba(168, 230, 255, 0.3) 0%, rgba(255, 135, 210, 0.3) 100%);
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 20px rgba(168, 230, 255, 0.2);
}

.splash-button:active {
  transform: scale(0.98);
}

@media (max-width: 600px) {
  .splash-content {
    padding: 30px 20px;
  }

  .splash-content h1 {
    font-size: 36px;
    letter-spacing: 2px;
  }

  .splash-content .subtitle {
    font-size: 14px;
  }
}
`;
    document.head.appendChild(s);
  }
}
