import type { Config, RenderConfig, TrailMode, RotationDirection } from '../types.js';
import type { BloomConfig } from '../rendering/BloomPass.js';
import { getAllScales, midiToNoteName, countNotesInRange } from '../music/ScaleSystem.js';
import { getAllInstruments } from '../audio/InstrumentLibrary.js';
import type { CustomModeLoader } from '../animation/CustomModeLoader.js';
import type { BackgroundShaderManager } from '../rendering/BackgroundShaderManager.js';
import { takeSnapshot, applySnapshot, savePreset, deletePreset, getPresets } from '../Presets.js';

// ─── Color scheme display names ─────────────────────────────────
const COLOR_SCHEMES: { key: string; label: string }[] = [
  { key: 'rainbow', label: 'Prism' },
  { key: 'harmonic', label: 'Consonance' },
  { key: 'neon', label: 'Ultraviolet' },
  { key: 'aurora', label: 'Northern Lights' },
  { key: 'fire', label: 'Ember' },
  { key: 'pastel', label: 'Watercolor' },
  { key: 'mono', label: 'Smoke & Ash' },
  { key: 'ocean', label: 'Abyss' },
  { key: 'sunset', label: 'Golden Hour' },
  { key: 'forest', label: 'Moss & Fern' },
];

type TabName = 'music' | 'motion' | 'style' | 'background' | 'presets';

export class SettingsOverlay {
  private root: HTMLDivElement;
  private scrim: HTMLDivElement;
  private tabContent: HTMLDivElement;
  private visible = false;
  private currentTab: TabName = 'music';
  private config!: Config;
  private renderConfig!: RenderConfig;
  private bloomConfig!: BloomConfig;
  private modeLoader: CustomModeLoader | null = null;
  private bgShaderManager: BackgroundShaderManager | null = null;
  private onChange: (() => void) | null = null;
  private onInstrumentChange: ((key: string) => void) | null = null;
  private onToggle: (() => void) | null = null;

  constructor() {
    // Scrim (click outside to close)
    this.scrim = document.createElement('div');
    this.scrim.className = 'settings-scrim';
    this.scrim.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.scrim);

    this.root = document.createElement('div');
    this.root.className = 'settings-overlay';
    this.tabContent = document.createElement('div');
    this.tabContent.className = 'settings-content';
    this.buildShell();
    document.body.appendChild(this.root);
    this.injectStyles();
  }

  bind(
    config: Config, renderConfig: RenderConfig,
    bloomConfig: BloomConfig,
    modeLoader: CustomModeLoader | null,
    bgShaderManager: BackgroundShaderManager | null,
    onChange: () => void,
    onInstrumentChange: (key: string) => void,
    onToggle?: () => void,
  ): void {
    this.config = config;
    this.renderConfig = renderConfig;
    this.bloomConfig = bloomConfig;
    this.modeLoader = modeLoader;
    this.bgShaderManager = bgShaderManager;
    this.onChange = onChange;
    this.onInstrumentChange = onInstrumentChange;
    this.onToggle = onToggle ?? null;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('open', this.visible);
    this.scrim.classList.toggle('visible', this.visible);
    if (this.visible) this.rebuild();
    this.onToggle?.();
  }

  isVisible(): boolean { return this.visible; }

  rebuild(): void {
    if (!this.visible || !this.config) return;
    this.tabContent.innerHTML = '';

    switch (this.currentTab) {
      case 'music': this.buildMusicTab(); break;
      case 'motion': this.buildMotionTab(); break;
      case 'style': this.buildStyleTab(); break;
      case 'background': this.buildBackgroundTab(); break;
      case 'presets': this.buildPresetsTab(); break;
    }
  }

  // ─── Shell ──────────────────────────────────────────────────────

  private buildShell(): void {
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.toggle());
    this.root.appendChild(closeBtn);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'settings-tabs';
    const tabs: { key: TabName; label: string }[] = [
      { key: 'music', label: 'Music' },
      { key: 'motion', label: 'Motion' },
      { key: 'style', label: 'Style' },
      { key: 'background', label: 'BG' },
      { key: 'presets', label: 'Presets' },
    ];
    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.className = 'settings-tab' + (t.key === this.currentTab ? ' active' : '');
      btn.addEventListener('click', () => {
        this.currentTab = t.key;
        tabBar.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.rebuild();
      });
      tabBar.appendChild(btn);
    }
    this.root.appendChild(tabBar);
    this.root.appendChild(this.tabContent);
  }

  // ─── Music Tab ────────────────────────────────────────────────

  private buildMusicTab(): void {
    const c = this.config;

    // Instrument
    this.addSelect('Instrument', getAllInstruments().map(i => ({ value: i.key, label: i.displayName })),
      c.instrument, v => { c.instrument = v; this.onInstrumentChange?.(v); });

    // Scale (grouped)
    const scales = getAllScales();
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const s of scales) {
      let arr = groups.get(s.category);
      if (!arr) { arr = []; groups.set(s.category, arr); }
      arr.push({ value: s.name, label: s.displayName });
    }
    this.addGroupedSelect('Scale', groups, c.scale, v => {
      c.scale = v;
      c.numNotes = Math.max(1, countNotesInRange(c.scale, c.lowNote, c.highNote));
      this.changed();
      this.rebuild();
    });

    // Note Range (dual-thumb slider)
    const noteCount = countNotesInRange(c.scale, c.lowNote, c.highNote);
    this.addRangeSlider(
      'Note Range', `${noteCount} notes`,
      c.lowNote, c.highNote, 21, 108, 12,
      (low, high) => {
        c.lowNote = low;
        c.highNote = high;
        c.numNotes = Math.max(1, countNotesInRange(c.scale, low, high));
        this.changed();
      },
      midiToNoteName,
    );

    // Volume
    this.addSlider('Volume', c.volume, 0, 1, 0.01, v => { c.volume = v; this.changed(); }, v => `${Math.round(v * 100)}%`);

    // Cycle Duration
    this.addSlider('Cycle Duration', c.cycleDuration, 10, 600, 1, v => { c.cycleDuration = v; this.changed(); }, v => `${v.toFixed(0)}s`);

    // Speed
    this.addSlider('Speed', c.speedMultiplier, 0.1, 4, 0.1, v => { c.speedMultiplier = v; this.changed(); }, v => `${v.toFixed(1)}x`);
  }

  // ─── Motion Tab ───────────────────────────────────────────────

  private buildMotionTab(): void {
    const c = this.config;
    const rc = this.renderConfig;

    // Animation Mode
    const modeNames = this.modeLoader?.getModeNames() ?? [];
    this.addSelect('Animation Mode', modeNames.map(n => ({ value: n, label: n })),
      c.animationMode, v => {
        c.animationMode = v;
        const mode = this.modeLoader?.getMode(v);
        if (mode) c.modeParams = this.modeLoader!.loadDefaultParams(mode);
        this.changed();
        this.rebuild(); // rebuild to show new mode params
      });

    // Rotation
    const rotations: { value: RotationDirection; label: string }[] = [
      { value: 'clockwise', label: 'Clockwise' },
      { value: 'counterclockwise', label: 'Counter-clockwise' },
      { value: 'alternating', label: 'Alternating' },
      { value: 'pingpong', label: 'Ping Pong' },
    ];
    this.addSelect('Rotation', rotations, c.rotationDirection, v => { c.rotationDirection = v as RotationDirection; this.changed(); });

    // Mode-specific parameters
    const mode = this.modeLoader?.getMode(c.animationMode);
    if (mode) {
      for (const p of mode.paramDefs) {
        const val = c.modeParams[p.name] ?? p.defaultVal;
        this.addSlider(p.label, val, p.minVal, p.maxVal, p.step || 0.01,
          v => { c.modeParams[p.name] = v; this.changed(); },
          v => p.step >= 1 ? v.toFixed(0) : v.toFixed(1));
      }
    }

    // ─── Path Lines section ──────────
    this.addSectionHeader('Path Lines');
    this.addCheckbox('Show path lines', rc.pathLine.show, v => { rc.pathLine.show = v; this.changed(); });
    if (rc.pathLine.show) {
      this.addSlider('Opacity', rc.pathLine.opacity, 0, 1, 0.01, v => { rc.pathLine.opacity = v; this.changed(); }, v => `${Math.round(v * 100)}%`);
      this.addCheckbox('Use dot colors', !rc.pathLine.monochrome, v => { rc.pathLine.monochrome = !v; this.changed(); });
    }

    // ─── Note Markers section ────────
    this.addSectionHeader('Note Markers');
    this.addCheckbox('Show markers', rc.triggerLine.show, v => { rc.triggerLine.show = v; this.changed(); this.rebuild(); });
    if (rc.triggerLine.show) {
      this.addSlider('Marker Size', rc.triggerLine.size, 0.5, 3, 0.1, v => { rc.triggerLine.size = v; this.changed(); });
      this.addCheckbox('Pulse on trigger', rc.triggerLine.pulse, v => { rc.triggerLine.pulse = v; this.changed(); this.rebuild(); });
      if (rc.triggerLine.pulse) {
        this.addSlider('Pulse Brightness', rc.triggerLine.pulseBrightness, 0, 5, 0.1, v => { rc.triggerLine.pulseBrightness = v; this.changed(); });
      }
    }
  }

  // ─── Style Tab ────────────────────────────────────────────────

  private buildStyleTab(): void {
    const rc = this.renderConfig;

    // Color scheme
    this.addSelect('Color Scheme', COLOR_SCHEMES.map(c => ({ value: c.key, label: c.label })),
      rc.colorScheme.name, v => { rc.colorScheme.name = v; this.changed(); });
    this.addSlider('Saturation', rc.colorScheme.saturationMultiplier, 0, 1, 0.01,
      v => { rc.colorScheme.saturationMultiplier = v; this.changed(); }, v => `${Math.round(v * 100)}%`);
    this.addSlider('Brightness', rc.colorScheme.brightnessMultiplier, 0, 1, 0.01,
      v => { rc.colorScheme.brightnessMultiplier = v; this.changed(); }, v => `${Math.round(v * 100)}%`);

    // Dots
    this.addSectionHeader('Dots');
    this.addSlider('Size', rc.dot.size, 2, 40, 1, v => { rc.dot.size = v; this.changed(); });
    this.addCheckbox('Glow', rc.dot.showGlow, v => { rc.dot.showGlow = v; this.changed(); this.rebuild(); });
    if (rc.dot.showGlow) {
      this.addSlider('Glow Opacity', rc.dot.glowOpacity, 0, 1, 0.01,
        v => { rc.dot.glowOpacity = v; this.changed(); }, v => `${Math.round(v * 100)}%`);
    }

    // Trails
    this.addSectionHeader('Trails');
    const trailModes: { value: TrailMode; label: string }[] = [
      { value: 'none', label: 'None' },
      { value: 'ribbon', label: 'Ribbon' },
      { value: 'particle', label: 'Particle' },
    ];
    this.addSelect('Trail Mode', trailModes, rc.trail.mode, v => {
      rc.trail.mode = v as TrailMode;
      this.changed();
      this.rebuild();
    });

    if (rc.trail.mode === 'ribbon') {
      this.addSlider('Width', rc.trail.width, 0.5, 20, 0.5, v => { rc.trail.width = v; this.changed(); });
      this.addSlider('Lifetime', rc.trail.lifetime, 0.1, 5, 0.1, v => { rc.trail.lifetime = v; this.changed(); }, v => `${v.toFixed(1)}s`);
      this.addSlider('Opacity', rc.trail.opacity, 0, 1, 0.01, v => { rc.trail.opacity = v; this.changed(); }, v => `${Math.round(v * 100)}%`);
      this.addSlider('Fade Curve', rc.trail.fadeExponent, 0.5, 5, 0.1, v => { rc.trail.fadeExponent = v; this.changed(); });
    }

    if (rc.trail.mode === 'particle') {
      this.addSlider('Particle Size', rc.trail.particleSize, 0.5, 10, 0.5, v => { rc.trail.particleSize = v; this.changed(); });
      this.addSlider('Lifetime', rc.trail.particleLifetime, 0.1, 3, 0.1, v => { rc.trail.particleLifetime = v; this.changed(); }, v => `${v.toFixed(1)}s`);
      this.addSlider('Spread', rc.trail.particleSpread, 0, 360, 1, v => { rc.trail.particleSpread = v; this.changed(); }, v => `${v.toFixed(0)}\u00b0`);
      this.addSlider('Eject Speed', rc.trail.particleEjectSpeed, 0, 200, 1, v => { rc.trail.particleEjectSpeed = v; this.changed(); });
    }

    // Burst Particles
    this.addSectionHeader('Burst Particles');
    this.addCheckbox('Emit on trigger', rc.particle.emitOnTrigger, v => { rc.particle.emitOnTrigger = v; this.changed(); this.rebuild(); });
    if (rc.particle.emitOnTrigger) {
      this.addSlider('Burst Count', rc.particle.burstCount, 1, 50, 1, v => { rc.particle.burstCount = v; this.changed(); });
      this.addSlider('Speed', rc.particle.speed, 10, 300, 1, v => { rc.particle.speed = v; this.changed(); });
      this.addSlider('Lifetime', rc.particle.lifetime, 0.1, 3, 0.1, v => { rc.particle.lifetime = v; this.changed(); }, v => `${v.toFixed(1)}s`);
      this.addSlider('Size', rc.particle.size, 1, 20, 0.5, v => { rc.particle.size = v; this.changed(); });
      this.addSlider('Gravity', rc.particle.gravity, 0, 5000, 50, v => { rc.particle.gravity = v; this.changed(); });
    }

    // Bloom
    this.addSectionHeader('Bloom');
    const bc = this.bloomConfig;
    this.addCheckbox('Enable bloom', bc.enabled, v => { bc.enabled = v; this.changed(); this.rebuild(); });
    if (bc.enabled) {
      this.addSlider('Intensity', bc.intensity, 0, 3, 0.05, v => { bc.intensity = v; this.changed(); });
      this.addSlider('Threshold', bc.threshold, 0, 1, 0.01, v => { bc.threshold = v; this.changed(); });
      this.addSlider('Soft Knee', bc.softKnee, 0, 1, 0.01, v => { bc.softKnee = v; this.changed(); });
    }
  }

  // ─── Background Tab ───────────────────────────────────────────

  private buildBackgroundTab(): void {
    const c = this.config;
    const rc = this.renderConfig;

    // Color picker (always visible)
    this.addSectionHeader('Background Color');
    this.addColorPicker(rc.backgroundColor, v => {
      rc.backgroundColor = v;
      this.changed();
    });

    // Shader selector
    this.addSectionHeader('Shader Effect');
    const shaders = this.bgShaderManager?.getShaderDefs() ?? [];
    const options = [
      { value: 'none', label: 'None' },
      ...shaders.map(s => ({ value: s.key, label: s.displayName })),
    ];
    this.addSelect('Shader', options, c.backgroundShader, v => {
      c.backgroundShader = v;
      this.changed();
      this.rebuild(); // rebuild to show shader params
    });

    // Per-shader params
    if (c.backgroundShader !== 'none' && this.bgShaderManager) {
      const def = shaders.find(s => s.key === c.backgroundShader);
      if (def && def.params.length > 0) {
        this.addSectionHeader('Shader Parameters');
        for (const p of def.params) {
          const val = this.bgShaderManager.getParam(def.key, p.uniform);
          if (p.type === 'bool') {
            this.addCheckbox(p.label, val > 0.5, v => {
              this.bgShaderManager!.setParam(def.key, p.uniform, v ? 1 : 0);
              this.changed();
            });
          } else {
            this.addSlider(p.label, val, p.minVal, p.maxVal,
              p.type === 'int' ? 1 : (p.maxVal - p.minVal) / 100,
              v => {
                this.bgShaderManager!.setParam(def.key, p.uniform, v);
                this.changed();
              },
            );
          }
        }
      }
    }
  }

  // ─── Presets Tab ──────────────────────────────────────────────

  private buildPresetsTab(): void {
    // Save new preset
    this.addSectionHeader('Save Current Settings');
    const saveRow = document.createElement('div');
    saveRow.className = 'settings-row';
    saveRow.style.display = 'flex';
    saveRow.style.gap = '6px';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Preset name...';
    nameInput.className = 'preset-name-input';
    nameInput.style.flex = '1';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'preset-action-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const snapshot = takeSnapshot(
        this.config, this.renderConfig, this.bloomConfig,
        () => this.bgShaderManager?.getAllParams() ?? {},
      );
      savePreset(name, snapshot);
      nameInput.value = '';
      this.rebuild();
    });

    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);
    this.tabContent.appendChild(saveRow);

    // List saved presets
    const presets = getPresets();
    if (presets.length > 0) {
      this.addSectionHeader('Saved Presets');
      for (const preset of presets) {
        const row = document.createElement('div');
        row.className = 'settings-row preset-row';

        const label = document.createElement('span');
        label.className = 'preset-label';
        label.textContent = preset.name;

        const loadBtn = document.createElement('button');
        loadBtn.className = 'preset-action-btn';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', () => {
          applySnapshot(
            preset.snapshot,
            this.config, this.renderConfig, this.bloomConfig,
            (p) => this.bgShaderManager?.setAllParams(p),
          );
          this.changed();
          this.onInstrumentChange?.(this.config.instrument);
          this.rebuild();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'preset-action-btn preset-delete-btn';
        delBtn.textContent = '\u00d7';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', () => {
          deletePreset(preset.name);
          this.rebuild();
        });

        row.appendChild(label);
        row.appendChild(loadBtn);
        row.appendChild(delBtn);
        this.tabContent.appendChild(row);
      }
    }
  }

  // ─── Widget builders ──────────────────────────────────────────

  private changed(): void {
    this.onChange?.();
  }

  private addSectionHeader(label: string): void {
    const h = document.createElement('div');
    h.className = 'settings-section-header';
    h.textContent = label;
    this.tabContent.appendChild(h);
  }

  private addSlider(
    label: string, value: number, min: number, max: number, step: number,
    onChange: (v: number) => void, format?: (v: number) => string,
  ): void {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const valSpan = document.createElement('span');
    valSpan.className = 'settings-value';
    valSpan.textContent = format ? format(value) : value.toFixed(2);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valSpan.textContent = format ? format(v) : v.toFixed(2);
      onChange(v);
    });

    const header = document.createElement('div');
    header.className = 'settings-row-header';
    header.appendChild(lbl);
    header.appendChild(valSpan);

    row.appendChild(header);
    row.appendChild(input);
    this.tabContent.appendChild(row);
  }

  private addRangeSlider(
    label: string, subtitle: string,
    valueLow: number, valueHigh: number, min: number, max: number, minGap: number,
    onChange: (low: number, high: number) => void,
    formatLabel: (v: number) => string,
  ): void {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const header = document.createElement('div');
    header.className = 'settings-row-header';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const sub = document.createElement('span');
    sub.className = 'settings-value';
    sub.textContent = subtitle;
    header.appendChild(lbl);
    header.appendChild(sub);
    row.appendChild(header);

    // Custom dual-thumb range slider drawn on a canvas
    const container = document.createElement('div');
    container.className = 'range-slider-container';
    container.style.position = 'relative';
    container.style.height = '36px';
    container.style.marginTop = '2px';

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '36px';
    container.appendChild(canvas);
    row.appendChild(container);
    this.tabContent.appendChild(row);

    let low = valueLow;
    let high = valueHigh;
    let dragging: 'low' | 'high' | null = null;

    const xToVal = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr2 = window.devicePixelRatio || 1;
      const pad = 14 * dpr2 / dpr2; // thumb radius in CSS px
      const innerW = rect.width - pad * 2;
      const t = Math.max(0, Math.min(1, (clientX - rect.left - pad) / innerW));
      return Math.round(min + t * (max - min));
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);

      const trackY = h / 2 - 1.5 * dpr;
      const trackH = 3 * dpr;
      const thumbR = 14 * dpr;
      const range = max - min;
      const padX = thumbR; // keep thumbs from clipping edges
      const trackInnerW = w - padX * 2;
      const lowX = padX + ((low - min) / range) * trackInnerW;
      const highX = padX + ((high - min) / range) * trackInnerW;

      // Track
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.roundRect(padX, trackY, trackInnerW, trackH, trackH / 2);
      ctx.fill();

      // Active fill
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(lowX, trackY, highX - lowX, trackH);

      // Thumbs with labels
      for (const [val, isDrag] of [[low, dragging === 'low'], [high, dragging === 'high']] as [number, boolean][]) {
        const tx = padX + ((val - min) / range) * trackInnerW;
        ctx.beginPath();
        ctx.arc(tx, h / 2, thumbR, 0, Math.PI * 2);
        ctx.fillStyle = isDrag ? '#ffffff' : '#c8c8d2';
        ctx.fill();

        const text = formatLabel(val);
        ctx.fillStyle = '#111';
        ctx.font = `600 ${10 * dpr}px 'Outfit', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, tx, h / 2 + 0.5 * dpr);
      }
    };

    // Initial draw after layout
    requestAnimationFrame(draw);

    canvas.addEventListener('pointerdown', (e) => {
      const v = xToVal(e.clientX);
      const distLow = Math.abs(v - low);
      const distHigh = Math.abs(v - high);
      dragging = distLow <= distHigh ? 'low' : 'high';
      canvas.setPointerCapture(e.pointerId);
      update(e.clientX);
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      update(e.clientX);
    });
    window.addEventListener('pointerup', () => {
      dragging = null;
      draw();
    });

    const update = (clientX: number) => {
      const v = xToVal(clientX);
      if (dragging === 'low') {
        low = Math.max(min, Math.min(v, high - minGap));
      } else if (dragging === 'high') {
        high = Math.min(max, Math.max(v, low + minGap));
      }
      sub.textContent = `${countNotesInRange(this.config.scale, low, high)} notes`;
      onChange(low, high);
      draw();
    };
  }

  private addCheckbox(label: string, value: boolean, onChange: (v: boolean) => void): void {
    const row = document.createElement('div');
    row.className = 'settings-row settings-checkbox-row';

    const lbl = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));

    lbl.appendChild(input);
    lbl.appendChild(document.createTextNode(' ' + label));
    row.appendChild(lbl);
    this.tabContent.appendChild(row);
  }

  private addSelect<T extends string>(
    label: string, options: { value: T; label: string }[],
    value: T, onChange: (v: T) => void,
  ): void {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const select = document.createElement('select');
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => onChange(select.value as T));

    row.appendChild(lbl);
    row.appendChild(select);
    this.tabContent.appendChild(row);
  }

  private addGroupedSelect(
    label: string, groups: Map<string, { value: string; label: string }[]>,
    value: string, onChange: (v: string) => void,
  ): void {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const select = document.createElement('select');
    for (const [groupName, opts] of groups) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupName;
      for (const opt of opts) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === value) o.selected = true;
        optgroup.appendChild(o);
      }
      select.appendChild(optgroup);
    }
    select.addEventListener('change', () => onChange(select.value));

    row.appendChild(lbl);
    row.appendChild(select);
    this.tabContent.appendChild(row);
  }

  private addColorPicker(color: [number, number, number], onChange: (v: [number, number, number]) => void): void {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#' + [color[0], color[1], color[2]].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
    input.style.width = '100%';
    input.style.height = '32px';
    input.style.border = 'none';
    input.style.cursor = 'pointer';

    input.addEventListener('input', () => {
      const hex = input.value;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      onChange([r, g, b]);
    });

    row.appendChild(input);
    this.tabContent.appendChild(row);
  }

  // ─── Styles ───────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById('settings-styles')) return;
    const style = document.createElement('style');
    style.id = 'settings-styles';
    style.textContent = `
.settings-scrim {
  position: fixed; inset: 0; z-index: 45;
  background: transparent;
  opacity: 0; pointer-events: none;
  transition: opacity 0.3s;
}
.settings-scrim.visible {
  opacity: 1; pointer-events: auto;
}
.settings-overlay {
  position: fixed;
  top: 0; left: 0; bottom: 0;
  width: 340px;
  background: rgba(18, 18, 28, 0.92);
  backdrop-filter: blur(16px);
  color: #e6e6e6;
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 13px;
  z-index: 50;
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0,0,0,0.5);
  overflow: hidden;
}
.settings-overlay.open {
  transform: translateX(0);
}

.settings-close {
  position: absolute; top: 6px; right: 8px;
  background: none; border: none; color: #888; font-size: 22px;
  cursor: pointer; z-index: 2; padding: 4px 8px; line-height: 1;
}
.settings-close:hover { color: #fff; }

.settings-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding: 8px 10px 0;
  gap: 2px;
  flex-shrink: 0;
}
.settings-tab {
  background: none; border: none; color: #888;
  padding: 6px 12px; font-size: 12px; cursor: pointer;
  border-bottom: 2px solid transparent;
  font-family: inherit; letter-spacing: 0.5px;
  text-transform: uppercase; font-weight: 500;
}
.settings-tab:hover { color: #ccc; }
.settings-tab.active { color: #fff; border-bottom-color: rgba(255,255,255,0.5); }

.settings-content {
  flex: 1; overflow-y: auto; padding: 12px 16px;
  scrollbar-width: thin; scrollbar-color: #444 transparent;
}
.settings-content::-webkit-scrollbar { width: 6px; }
.settings-content::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

.settings-section-header {
  color: #888; font-size: 11px; text-transform: uppercase;
  letter-spacing: 1px; margin: 16px 0 6px; padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-weight: 600;
}
.settings-section-header:first-child { margin-top: 4px; border-top: none; }

.settings-row {
  margin-bottom: 10px;
}
.settings-row > label {
  display: block; color: #aaa; font-size: 12px; margin-bottom: 3px;
}
.settings-row-header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 3px;
}
.settings-row-header label { color: #aaa; font-size: 12px; }
.settings-value { color: #666; font-size: 11px; font-variant-numeric: tabular-nums; }

.settings-row input[type="range"] {
  width: 100%; height: 18px; -webkit-appearance: none; appearance: none;
  background: transparent; cursor: pointer;
}
.settings-row input[type="range"]::-webkit-slider-runnable-track {
  height: 3px; background: rgba(255,255,255,0.15); border-radius: 2px;
}
.settings-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px;
  border-radius: 50%; background: #ccc; margin-top: -5.5px;
  border: none; transition: background 0.15s;
}
.settings-row input[type="range"]::-webkit-slider-thumb:hover { background: #fff; }
.settings-row input[type="range"]::-moz-range-track {
  height: 3px; background: rgba(255,255,255,0.15); border-radius: 2px; border: none;
}
.settings-row input[type="range"]::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%; background: #ccc; border: none;
}

.settings-row select {
  width: 100%; padding: 5px 8px;
  background: rgba(255,255,255,0.08); color: #ddd;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
  font-size: 13px; font-family: inherit; cursor: pointer;
  outline: none;
}
.settings-row select:focus { border-color: rgba(255,255,255,0.3); }
.settings-row select option, .settings-row select optgroup { background: #1a1a2a; color: #ddd; }

.settings-checkbox-row label {
  display: flex; align-items: center; gap: 6px;
  cursor: pointer; color: #ccc; font-size: 13px;
}
.settings-checkbox-row input[type="checkbox"] {
  width: 15px; height: 15px; accent-color: #888;
  cursor: pointer;
}

.preset-name-input {
  padding: 5px 8px;
  background: rgba(255,255,255,0.08);
  color: #ddd;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.preset-name-input:focus { border-color: rgba(255,255,255,0.3); }
.preset-name-input::placeholder { color: #666; }

.preset-action-btn {
  padding: 5px 12px;
  background: rgba(255,255,255,0.1);
  color: #ccc;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.preset-action-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }

.preset-delete-btn {
  padding: 5px 8px;
  color: #888;
  font-size: 16px;
  line-height: 1;
}
.preset-delete-btn:hover { color: #f66; }

.preset-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.preset-label {
  flex: 1;
  color: #ccc;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
    document.head.appendChild(style);
  }
}
