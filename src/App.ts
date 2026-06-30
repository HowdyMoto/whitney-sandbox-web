import { initWebGL, getWidth, getHeight, resizeCanvas } from './rendering/WebGLContext.js';
import { DotRenderer } from './rendering/DotRenderer.js';
import { PathLineRenderer } from './rendering/PathLineRenderer.js';
import { TrailRenderer } from './rendering/TrailRenderer.js';
import { ParticleSystem } from './rendering/ParticleSystem.js';
import { AnimationEngine } from './animation/AnimationEngine.js';
import { CustomModeLoader } from './animation/CustomModeLoader.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { SettingsOverlay } from './ui/SettingsOverlay.js';
import { TransportBar } from './ui/TransportBar.js';
import { PerfOverlay } from './ui/PerfOverlay.js';
import { PianoKeyboard } from './ui/PianoKeyboard.js';
import { SplashModal } from './ui/SplashModal.js';
import { BloomPass, defaultBloomConfig } from './rendering/BloomPass.js';
import type { BloomConfig } from './rendering/BloomPass.js';
import { BackgroundShaderManager } from './rendering/BackgroundShaderManager.js';
import { AudioReactiveData } from './physics/AudioReactiveData.js';
import { countNotesInRange, getAllScales } from './music/ScaleSystem.js';
import { getAllInstruments } from './audio/InstrumentLibrary.js';
import { defaultConfig, defaultRenderConfig, ROTATION_DIRECTIONS, TRAIL_MODES, COLOR_SCHEMES } from './types.js';
import type { Config, RenderConfig, TriggerEvent } from './types.js';
import { takeSnapshot, applySnapshot, saveCurrentState, loadCurrentState } from './Presets.js';
import { MidiOutput } from './audio/MidiOutput.js';

export class App {
  private gl: WebGL2RenderingContext;
  private dotRenderer: DotRenderer;
  private pathLineRenderer: PathLineRenderer;
  private trailRenderer: TrailRenderer;
  private particleSystem: ParticleSystem;
  private animEngine: AnimationEngine;
  private modeLoader: CustomModeLoader;
  private audioEngine: AudioEngine;
  private settingsOverlay: SettingsOverlay;
  private transportBar: TransportBar;
  private perfOverlay: PerfOverlay;
  private pianoKeyboard: PianoKeyboard;
  private bloomPass: BloomPass;
  private bloomConfig: BloomConfig;
  private bgShaderManager: BackgroundShaderManager;
  private audioReactive: AudioReactiveData;
  private midiOutput: MidiOutput;
  private config: Config;
  private renderConfig: RenderConfig;
  private isPlaying = false;
  private lastTime = 0;
  private animFrameId = 0;
  private audioStarted = false;
  // Background shaders animate on their own clock so they stay alive even
  // when the box is paused or hasn't been played yet — otherwise randomizing
  // before pressing play leaves the time-driven backgrounds frozen/blank.
  private shaderTime = 0;

  // Trail particle emission accumulator (per dot)
  private trailEmitAccum: number[] = [];

  // Overlay elements
  private canvas: HTMLCanvasElement;
  private modeLabel: HTMLDivElement;
  private modeLabelTimeout = 0;
  private mouseIdleTimeout = 0;
  private saveTimeout = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Show splash modal on startup
    const splash = new SplashModal();
    splash.onDismissed(() => {
      // Immediately warm audio context when splash dismisses
      // This ensures audio context is created in response to user gesture
      this.audioEngine.ensureContext();
    });

    this.gl = initWebGL(canvas);
    this.dotRenderer = new DotRenderer(this.gl);
    this.pathLineRenderer = new PathLineRenderer(this.gl);
    this.trailRenderer = new TrailRenderer(this.gl);
    this.particleSystem = new ParticleSystem(this.gl);
    this.animEngine = new AnimationEngine();
    this.modeLoader = new CustomModeLoader();
    this.audioEngine = new AudioEngine();
    this.settingsOverlay = new SettingsOverlay();
    this.pianoKeyboard = new PianoKeyboard();
    this.midiOutput = new MidiOutput();
    this.transportBar = new TransportBar({
      onPlayPause: () => { this.togglePlay(); },
      onMute: () => { this.config.soundEnabled = !this.config.soundEnabled; this.updateTransport(); },
      onKeyboard: () => { this.pianoKeyboard.toggle(); this.updateTransport(); },
      onRandomize: () => this.randomizeMode(),
      onMidi: () => { this.toggleMidi(); },
      onPerfToggle: () => { this.perfOverlay.toggle(); this.updateTransport(); },
      onWarmAudio: () => { this.warmAudioContext(); },
    });
    this.perfOverlay = new PerfOverlay();
    this.bloomPass = new BloomPass(this.gl, 1, 1); // resized in draw()
    this.bloomConfig = defaultBloomConfig();
    this.bgShaderManager = new BackgroundShaderManager(this.gl);
    this.audioReactive = new AudioReactiveData();
    this.config = defaultConfig();
    this.renderConfig = defaultRenderConfig();

    // Mode name overlay
    this.modeLabel = document.createElement('div');
    Object.assign(this.modeLabel.style, {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      color: 'white', fontFamily: "'Outfit', system-ui, sans-serif", fontSize: '20px',
      fontWeight: '300', letterSpacing: '2px', opacity: '0',
      transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: '10',
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
    });
    document.body.appendChild(this.modeLabel);

    // Warm up AudioContext on first user interaction (mobile autoplay policy)
    const warmAudio = () => this.warmAudioContext();
    window.addEventListener('click', warmAudio, { once: true });
    window.addEventListener('touchstart', warmAudio, { once: true, passive: true });
    window.addEventListener('keydown', warmAudio, { once: true });

    // Mouse movement shows the edge tab, idle hides it
    window.addEventListener('mousemove', (e) => this.onMouseActivity(e));
    window.addEventListener('touchstart', () => this.onMouseActivity(), { passive: true });

    // Click/tap anywhere toggles settings overlay
    canvas.addEventListener('click', () => {
      this.settingsOverlay.toggle();
      this.settingsOverlay.hideEdgeTab();
    });

    // Right-click to randomize
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.randomizeMode();
    });

    // Two-finger tap to randomize (detect 2+ touches)
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        this.randomizeMode();
      }
    });

    // Scroll to adjust speed
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.adjustSpeed(delta);
    }, { passive: false });

    this.animEngine.init(this.config);

    // Load background shaders
    const shaderFiles = [
      'aurora', 'fireworks', 'fractal_bloom',
      'impulse', 'kaleidoscope', 'neural_web', 'phosphor_trails',
      'sacred_geometry', 'spectrum', 'string_theory',
    ];
    const displayShaders = [
      'aurora_display', 'fireworks_display', 'phosphor_trails_display',
    ];
    const allShaderUrls = [
      ...shaderFiles.map(f => `${import.meta.env.BASE_URL}shaders/backgrounds/${f}.frag`),
      ...displayShaders.map(f => `${import.meta.env.BASE_URL}shaders/backgrounds/${f}.frag`),
    ];
    this.bgShaderManager.loadShaders(allShaderUrls);

    this.modeLoader.loadAll().then(() => {
      this.animEngine.setModeLoader(this.modeLoader);
      this.pathLineRenderer.setModeLoader(this.modeLoader);

      // Restore saved state or use defaults
      const saved = loadCurrentState();
      if (saved) {
        applySnapshot(saved, this.config, this.renderConfig, this.bloomConfig,
          (p) => this.bgShaderManager.setAllParams(p));
      } else {
        const mode = this.modeLoader.getMode(this.config.animationMode);
        if (mode) {
          this.config.modeParams = this.modeLoader.loadDefaultParams(mode);
        }
      }

      // Bind settings overlay to live config objects
      this.settingsOverlay.bind(
        this.config, this.renderConfig, this.bloomConfig,
        this.modeLoader, this.bgShaderManager,
        () => { this.scheduleAutoSave(); },
        (key) => this.switchInstrument(key),
        () => this.settingsOverlay.hideEdgeTab(),
      );

      this.lastTime = performance.now() / 1000;
      this.loop();
      this.showModeName(this.config.animationMode);
    });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  private togglePlay(): void {
    // Flip play state synchronously so the animation starts (and the button
    // responds) on the very first tap. Audio is initialized in the
    // background — gating playback on a network-bound sample load made the
    // play button appear unresponsive on mobile, so users tapped repeatedly.
    this.isPlaying = !this.isPlaying;
    this.updateTransport();
    if (this.isPlaying && !this.audioStarted) {
      void this.ensureAudio();
    }
  }

  private async ensureAudio(): Promise<void> {
    if (this.audioStarted) return;
    this.audioStarted = true;
    await this.audioEngine.ensureContext();
    await this.audioEngine.switchInstrument(
      this.config.instrument, this.config.lowNote, this.config.highNote,
    );
  }

  /** Warm up AudioContext on any user gesture so it's ready for playback */
  private warmAudioContext(): void {
    // ensureContext() creates + unlocks the context (silent buffer) within
    // this gesture, then resumes it if already suspended. Fire-and-forget so
    // the calling gesture handler isn't blocked.
    void this.audioEngine.ensureContext();
  }

  private loop = (): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastTime, 0.1);
    this.lastTime = now;

    // Advance the background-shader clock continuously. While playing it
    // tracks the music speed (matching prior behavior); while paused it keeps
    // ticking at 1x so backgrounds remain animated.
    this.shaderTime += dt * (this.isPlaying ? this.config.speedMultiplier : 1);

    resizeCanvas();
    this.update(dt);
    this.draw();

    // Update piano keyboard
    this.pianoKeyboard.setConfig(
      this.config.lowNote, this.config.highNote, this.config.scale,
      this.renderConfig.colorScheme.name,
      this.renderConfig.colorScheme.saturationMultiplier,
      this.renderConfig.colorScheme.brightnessMultiplier,
      (low, high) => {
        this.config.lowNote = low;
        this.config.highNote = high;
        this.config.numNotes = Math.max(1, countNotesInRange(this.config.scale, low, high));
      },
    );
    this.pianoKeyboard.update(dt);

    // Update perf stats
    this.perfOverlay.update(
      this.animEngine.getNumDots(),
      this.particleSystem.getActiveCount(),
    );
  };

  private update(dt: number): void {
    const w = getWidth();
    const h = getHeight();
    let triggers: TriggerEvent[] = [];

    if (this.isPlaying) {
      triggers = this.animEngine.update(
        dt, this.config, this.renderConfig.colorScheme.name, true, w, h,
      );

      // Play triggered notes
      for (const t of triggers) {
        if (this.audioStarted && this.config.soundEnabled) {
          this.audioEngine.playNoteByMidi(t.midiNote, t.velocity);
        }
        this.midiOutput.sendNoteOn(t.midiNote, t.velocity);
        this.pianoKeyboard.noteOn(t.midiNote);
        this.audioReactive.noteOn(t.midiNote, t.velocity);
      }
    } else {
      this.animEngine.updatePositionsOnly(this.config, this.renderConfig.colorScheme.name, w, h);
    }

    const dots = this.animEngine.getDotStates();

    // Update trails
    if (this.isPlaying) {
      this.trailRenderer.update(dt, dots);
    }

    // Emit burst particles on trigger
    if (this.renderConfig.particle.emitOnTrigger) {
      for (const t of triggers) {
        const dot = dots[t.dotIndex]!;
        this.particleSystem.emitBurst(
          dot.position[0], dot.position[1],
          dot.velocity[0], dot.velocity[1],
          dot, this.renderConfig.particle,
        );
      }
    }

    // Emit trail particles (when trail mode is 'particle')
    if (this.renderConfig.trail.mode === 'particle' && this.isPlaying) {
      // Ensure accumulator array is sized
      while (this.trailEmitAccum.length < dots.length) this.trailEmitAccum.push(0);
      this.trailEmitAccum.length = dots.length;

      const interval = 1 / Math.max(this.renderConfig.trail.particlesPerSecond, 1);
      for (let i = 0; i < dots.length; i++) {
        this.trailEmitAccum[i] = (this.trailEmitAccum[i] ?? 0) + dt;
        while (this.trailEmitAccum[i]! >= interval) {
          this.trailEmitAccum[i]! -= interval;
          const dot = dots[i]!;
          this.particleSystem.emitTrail(
            dot.position[0], dot.position[1],
            dot.velocity[0], dot.velocity[1],
            dot, this.renderConfig.trail,
          );
        }
      }
    }

    // Update particle physics
    this.particleSystem.update(dt, this.renderConfig.particle);

    // Update audio reactive data (EQ bands, trigger events for shaders)
    this.audioReactive.update(dt);
    // Use the shader clock so trigger-event birth times share the same time
    // base as the background shaders that consume them.
    this.audioReactive.updateTriggerEvents(dots, this.shaderTime);
  }

  private draw(): void {
    const gl = this.gl;
    const w = getWidth();
    const h = getHeight();
    const bg = this.renderConfig.backgroundColor;

    // Resize bloom FBOs if needed
    this.bloomPass.resize(w, h);

    // Render scene into bloom FBO (or directly to screen if bloom disabled)
    if (this.bloomConfig.enabled) {
      this.bloomPass.beginScene();
    }

    gl.viewport(0, 0, w, h);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const dots = this.animEngine.getDotStates();

    // Draw order matches C++ RenderPipeline:
    // 1. Background shader — renders into whatever FBO is currently bound
    //    (bloom sceneFBO if bloom enabled, screen if not)
    this.bgShaderManager.setActiveShader(this.config.backgroundShader);
    if (this.bgShaderManager.isActive()) {
      const sceneFbo = this.bloomConfig.enabled ? this.bloomPass.sceneFBO : null;
      this.bgShaderManager.render(
        dots, this.shaderTime, this.animEngine.getCycleProgress(),
        this.renderConfig.backgroundColor, w, h,
        sceneFbo, this.audioReactive,
      );
      // Re-bind the bloom FBO after background shader (it may have unbound it during sim passes)
      if (sceneFbo) {
        sceneFbo.bind();
      }
      // Restore blend state (background shader disables it for fullscreen quad passes)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    // 2. Path lines (orbit guides + trigger markers)
    this.pathLineRenderer.draw(
      dots, this.config,
      this.renderConfig.pathLine, this.renderConfig.triggerLine,
      w, h,
    );

    // 3. Trail ribbons
    this.trailRenderer.draw(
      dots, this.renderConfig.trail, this.renderConfig.colorScheme,
      w, h,
    );

    // 4. Particles
    this.particleSystem.draw(w, h);

    // 5. Dots (glow + core)
    this.dotRenderer.draw(dots, this.renderConfig, w, h);

    // 6. Bloom post-process
    if (this.bloomConfig.enabled) {
      this.bloomPass.apply(this.bloomConfig);
    }
  }

  private adjustSpeed(delta: number): void {
    this.config.speedMultiplier = Math.max(0.1, Math.min(4, this.config.speedMultiplier + delta));
    this.showModeName(`Speed: ${this.config.speedMultiplier.toFixed(1)}x`, false);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === ' ') {
      e.preventDefault();
      this.togglePlay();
      this.transportBar.dismissTooltip();
    } else if (e.key === 'm' || e.key === 'M') {
      this.config.soundEnabled = !this.config.soundEnabled;
      this.showModeName(this.config.soundEnabled ? 'Sound: ON' : 'Sound: OFF');
      this.updateTransport();
    } else if (e.key === 'r' || e.key === 'R') {
      this.randomizeMode();
    } else if (e.key === 'p' || e.key === 'P') {
      // Toggle burst particles on trigger
      this.renderConfig.particle.emitOnTrigger = !this.renderConfig.particle.emitOnTrigger;
      this.showModeName(this.renderConfig.particle.emitOnTrigger ? 'Particles: ON' : 'Particles: OFF');
    } else if (e.key === 't' || e.key === 'T') {
      // Cycle trail mode: ribbon → particle → none → ribbon
      const modes = ['ribbon', 'particle', 'none'] as const;
      const idx = modes.indexOf(this.renderConfig.trail.mode);
      this.renderConfig.trail.mode = modes[(idx + 1) % modes.length]!;
      this.showModeName('Trail: ' + this.renderConfig.trail.mode);
    } else if (e.key === 'g' || e.key === 'G') {
      // Toggle glow
      this.renderConfig.dot.showGlow = !this.renderConfig.dot.showGlow;
      this.showModeName(this.renderConfig.dot.showGlow ? 'Glow: ON' : 'Glow: OFF');
    } else if (e.key === 'k' || e.key === 'K') {
      this.pianoKeyboard.toggle();
      this.updateTransport();
    } else if (e.key === 'b' || e.key === 'B') {
      this.bloomConfig.enabled = !this.bloomConfig.enabled;
      this.showModeName(this.bloomConfig.enabled ? 'Bloom: ON' : 'Bloom: OFF');
    } else if (e.key === 'o' || e.key === 'O') {
      this.settingsOverlay.toggle();
    } else if (e.key === '-' || e.key === '_') {
      this.adjustSpeed(-0.1);
    } else if (e.key === '+' || e.key === '=') {
      this.adjustSpeed(0.1);
    }
    this.scheduleAutoSave();
  }

  private onMouseActivity(e?: MouseEvent): void {
    if (this.settingsOverlay.isVisible()) return;

    const near = !!(e && e.clientX < 40);
    this.settingsOverlay.showEdgeTab(near);

    clearTimeout(this.mouseIdleTimeout);
    this.mouseIdleTimeout = window.setTimeout(() => {
      if (!this.settingsOverlay.isVisible()) {
        this.settingsOverlay.hideEdgeTab();
      }
    }, 2500);
  }

  private updateTransport(): void {
    this.transportBar.update({
      isPlaying: this.isPlaying,
      soundEnabled: this.config.soundEnabled,
      keyboardVisible: this.pianoKeyboard.isVisible(),
      midiEnabled: this.midiOutput.isEnabled(),
      midiSupported: this.midiOutput.isSupported(),
      perfVisible: this.perfOverlay.isVisible(),
    });
    this.transportBar.setBottomOffset(this.pianoKeyboard.getHeight());
    this.syncCanvasHeight();
  }

  private syncCanvasHeight(): void {
    const pianoH = this.pianoKeyboard.getHeight();
    this.canvas.style.height = pianoH > 0 ? `calc(100% - ${pianoH}px)` : '100%';
  }

  private toggleMidi(): void {
    if (this.midiOutput.isEnabled()) {
      this.midiOutput.disable();
      this.showModeName('MIDI: OFF');
      this.updateTransport();
    } else {
      this.midiOutput.enable().then(ok => {
        if (ok) {
          this.showModeName('MIDI: ' + this.midiOutput.getOutputName());
        } else {
          this.showModeName('MIDI: Not Available');
        }
        this.updateTransport();
      });
    }
  }

  private async switchInstrument(key: string): Promise<void> {
    this.config.instrument = key;
    await this.ensureAudio();
    await this.audioEngine.switchInstrument(key, this.config.lowNote, this.config.highNote);
  }

  private randomizeMode(): void {
    this.settingsOverlay.showLoadingDuring(() => this.doRandomize());
  }

  private async doRandomize(): Promise<void> {
    // When adding new settings to the app, remember to add randomization ranges here!
    const rand = Math.random;
    const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
    const range = (min: number, max: number) => min + rand() * (max - min);
    const snap = (v: number, step: number) => Math.round(v / step) * step;
    const c = this.config;
    const rc = this.renderConfig;

    // ── Animation mode ──
    const names = this.modeLoader.getModeNames();
    if (names.length > 0) {
      let newMode: string;
      if (names.length === 1) {
        newMode = names[0]!;
      } else {
        do { newMode = pick(names); } while (newMode === c.animationMode);
      }
      c.animationMode = newMode;

      const mode = this.modeLoader.getMode(newMode);
      if (mode) {
        // Randomize mode-specific params within their slider ranges
        const params: Record<string, number> = {};
        for (const p of mode.paramDefs) {
          if (p.options.length > 0) {
            params[p.name] = pick(p.options).value;
          } else {
            params[p.name] = snap(range(p.minVal, p.maxVal), p.step || 0.01);
          }
        }
        c.modeParams = params;
      }
    }

    // ── Rotation ──
    c.rotationDirection = pick(ROTATION_DIRECTIONS);

    // ── Scale & note range ──
    const scales = getAllScales();
    c.scale = pick(scales).name;
    c.lowNote = Math.floor(range(21, 60));
    c.highNote = Math.floor(range(Math.max(c.lowNote + 12, 60), 108));
    c.numNotes = Math.max(1, countNotesInRange(c.scale, c.lowNote, c.highNote));

    // ── Instrument ──
    const instruments = getAllInstruments();
    const newInstrument = pick(instruments).key;
    await this.switchInstrument(newInstrument);

    // ── Timing ──
    c.cycleDuration = snap(range(30, 300), 1);
    c.speedMultiplier = snap(range(0.3, 2.0), 0.1);

    // ── Color scheme ──
    rc.colorScheme.name = pick([...COLOR_SCHEMES]);
    rc.colorScheme.saturationMultiplier = range(0.3, 1);
    rc.colorScheme.brightnessMultiplier = range(0.5, 1);

    // ── Dots ──
    rc.dot.size = snap(range(4, 24), 1);
    rc.dot.showGlow = rand() > 0.5;
    rc.dot.glowOpacity = range(0.2, 0.8);

    // ── Path Lines ──
    rc.pathLine.width = snap(range(0.5, 8), 0.5);
    rc.pathLine.opacity = range(0.2, 0.8);

    // ── Trails ──
    rc.trail.mode = pick(TRAIL_MODES);
    rc.trail.width = snap(range(1, 12), 0.5);
    rc.trail.lifetime = snap(range(0.3, 3), 0.1);
    rc.trail.opacity = range(0.3, 0.9);
    rc.trail.fadeExponent = snap(range(1, 4), 0.1);
    rc.trail.particleSize = snap(range(1, 6), 0.5);
    rc.trail.particleLifetime = snap(range(0.2, 1.5), 0.1);
    rc.trail.particleSpread = snap(range(10, 180), 1);
    rc.trail.particleEjectSpeed = snap(range(0, 100), 1);

    // ── Burst particles ──
    rc.particle.emitOnTrigger = rand() > 0.5;
    rc.particle.burstCount = snap(range(4, 30), 1);
    rc.particle.speed = snap(range(20, 200), 1);
    rc.particle.lifetime = snap(range(0.2, 1.5), 0.1);
    rc.particle.size = snap(range(2, 12), 0.5);
    rc.particle.gravity = snap(range(0, 3000), 50);

    // ── Bloom ──
    this.bloomConfig.enabled = rand() > 0.3;
    this.bloomConfig.intensity = snap(range(0.2, 1.5), 0.05);
    this.bloomConfig.threshold = snap(range(0.1, 0.6), 0.01);
    this.bloomConfig.softKnee = snap(range(0.2, 0.8), 0.01);

    // ── Background shader ──
    const shaderDefs = this.bgShaderManager.getShaderDefs();
    if (shaderDefs.length > 0 && rand() > 0.3) {
      const shader = pick(shaderDefs);
      c.backgroundShader = shader.key;
      // Randomize shader params within their rand ranges
      for (const p of shader.params) {
        const val = p.type === 'bool'
          ? (rand() > 0.5 ? 1 : 0)
          : range(p.randMin, p.randMax);
        this.bgShaderManager.setParam(shader.key, p.uniform, val);
      }
    } else {
      c.backgroundShader = 'none';
    }

    // ── Background color ──
    rc.backgroundColor = [range(0, 0.1), range(0, 0.1), range(0, 0.12)];

    // Reset trails and show the new mode name
    this.trailRenderer.reset();
    this.settingsOverlay.rebuild();
    this.scheduleAutoSave();
    this.showModeName(c.animationMode);
  }

  private modeLabelTimers: number[] = [];

  private showModeName(name: string, animate: boolean = true): void {
    // Clear any pending animations
    clearTimeout(this.modeLabelTimeout);
    for (const t of this.modeLabelTimers) clearTimeout(t);
    this.modeLabelTimers.length = 0;
    this.modeLabel.innerHTML = '';
    this.modeLabel.style.opacity = '1';

    if (!animate) {
      // Show immediately without animation (for live updates like speed)
      this.modeLabel.textContent = name;
      this.modeLabelTimeout = window.setTimeout(() => {
        this.modeLabel.style.opacity = '0';
      }, 2000);
      return;
    }

    // Create a span per character and reveal them sequentially
    const spans: HTMLSpanElement[] = [];
    for (const ch of name) {
      const span = document.createElement('span');
      span.textContent = ch;
      span.style.display = 'inline-block';
      span.style.opacity = '0';
      span.style.transform = 'translateY(8px) scale(0.7)';
      span.style.transition = 'opacity 0.18s, transform 0.18s cubic-bezier(0.34, 1.3, 0.64, 1)';
      if (ch === ' ') span.style.width = '0.3em';
      this.modeLabel.appendChild(span);
      spans.push(span);
    }

    const delay = Math.min(40, 400 / Math.max(name.length, 1));

    // Roll in
    for (let i = 0; i < spans.length; i++) {
      this.modeLabelTimers.push(setTimeout(() => {
        spans[i]!.style.opacity = '1';
        spans[i]!.style.transform = 'translateY(0) scale(1)';
      }, i * delay));
    }

    // Roll out (reverse order)
    const rollOutStart = 2000 + spans.length * delay;
    for (let i = 0; i < spans.length; i++) {
      const ri = spans.length - 1 - i; // reverse index
      this.modeLabelTimers.push(setTimeout(() => {
        spans[ri]!.style.opacity = '0';
        spans[ri]!.style.transform = 'translateY(-8px) scale(0.7)';
      }, rollOutStart + i * delay));
    }

    // Hide container after roll-out completes
    this.modeLabelTimeout = window.setTimeout(() => {
      this.modeLabel.style.opacity = '0';
    }, rollOutStart + spans.length * delay + 200);
  }

  private scheduleAutoSave(): void {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      saveCurrentState(takeSnapshot(
        this.config, this.renderConfig, this.bloomConfig,
        () => this.bgShaderManager.getAllParams(),
      ));
    }, 500);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.dotRenderer.dispose();
    this.pathLineRenderer.dispose();
    this.trailRenderer.dispose();
    this.particleSystem.dispose();
    this.bloomPass.dispose();
    this.bgShaderManager.dispose();
    this.audioEngine.killAllVoices();
    clearTimeout(this.modeLabelTimeout);
    this.modeLabel.remove();
  }
}
