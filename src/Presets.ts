import { type Config, type RenderConfig, defaultConfig, defaultRenderConfig } from './types.js';
import { type BloomConfig, defaultBloomConfig } from './rendering/BloomPass.js';

const STORAGE_KEY = 'whitney-current';
const PRESETS_KEY = 'whitney-presets';

export interface Snapshot {
  config: Config;
  renderConfig: RenderConfig;
  bloomConfig: BloomConfig;
  /** Shader param overrides: shaderKey → uniform → value */
  shaderParams: Record<string, Record<string, number>>;
}

export interface NamedPreset {
  name: string;
  snapshot: Snapshot;
}

// ─── Built-in presets ──────────────────────────────────────────────

function builtIn(name: string, patch: {
  config?: Partial<Config>;
  renderConfig?: Partial<{
    backgroundColor: [number, number, number];
    dot: Partial<RenderConfig['dot']>;
    trail: Partial<RenderConfig['trail']>;
    pathLine: Partial<RenderConfig['pathLine']>;
    triggerLine: Partial<RenderConfig['triggerLine']>;
    noteText: Partial<RenderConfig['noteText']>;
    particle: Partial<RenderConfig['particle']>;
    colorScheme: Partial<RenderConfig['colorScheme']>;
  }>;
  bloomConfig?: Partial<BloomConfig>;
  shaderParams?: Record<string, Record<string, number>>;
}): NamedPreset {
  const c = defaultConfig();
  const rc = defaultRenderConfig();
  const bc = defaultBloomConfig();
  if (patch.config) Object.assign(c, patch.config);
  if (patch.renderConfig) {
    if (patch.renderConfig.backgroundColor) rc.backgroundColor = patch.renderConfig.backgroundColor;
    if (patch.renderConfig.dot) Object.assign(rc.dot, patch.renderConfig.dot);
    if (patch.renderConfig.trail) Object.assign(rc.trail, patch.renderConfig.trail);
    if (patch.renderConfig.pathLine) Object.assign(rc.pathLine, patch.renderConfig.pathLine);
    if (patch.renderConfig.triggerLine) Object.assign(rc.triggerLine, patch.renderConfig.triggerLine);
    if (patch.renderConfig.noteText) Object.assign(rc.noteText, patch.renderConfig.noteText);
    if (patch.renderConfig.particle) Object.assign(rc.particle, patch.renderConfig.particle);
    if (patch.renderConfig.colorScheme) Object.assign(rc.colorScheme, patch.renderConfig.colorScheme);
  }
  if (patch.bloomConfig) Object.assign(bc, patch.bloomConfig);
  return {
    name,
    snapshot: {
      config: c,
      renderConfig: rc,
      bloomConfig: bc,
      shaderParams: patch.shaderParams ?? {},
    },
  };
}

export const BUILT_IN_PRESETS: NamedPreset[] = [
  builtIn('Classic', {
    config: {
      animationMode: 'Circular',
      scale: 'major',
      numNotes: 36,
      lowNote: 36,
      highNote: 84,
      cycleDuration: 240,
      speedMultiplier: 1,
      rotationDirection: 'clockwise',
      backgroundShader: 'none',
    },
    renderConfig: {
      colorScheme: { name: 'rainbow', saturationMultiplier: 0.5, brightnessMultiplier: 0.9 },
      trail: { mode: 'ribbon', width: 4, lifetime: 1, opacity: 0.6, fadeExponent: 2 },
      dot: { size: 12, showGlow: false },
      pathLine: { show: true, opacity: 0.12 },
    },
    bloomConfig: { enabled: true, intensity: 0.6, threshold: 0.35, softKnee: 0.5 },
  }),

  builtIn('Cosmic', {
    config: {
      animationMode: 'Spirograph',
      scale: 'wholeTone',
      numNotes: 48,
      lowNote: 36,
      highNote: 96,
      cycleDuration: 180,
      speedMultiplier: 0.8,
      rotationDirection: 'alternating',
      backgroundShader: 'phosphor_trails',
    },
    renderConfig: {
      backgroundColor: [0.02, 0.01, 0.06],
      colorScheme: { name: 'neon', saturationMultiplier: 0.9, brightnessMultiplier: 1.0 },
      trail: { mode: 'particle', width: 3, lifetime: 1.5, opacity: 0.7, fadeExponent: 2,
        particleSize: 2.5, particleLifetime: 1.0, particleSpread: 60, particleEjectSpeed: 20 },
      dot: { size: 8, showGlow: true, glowOpacity: 0.6 },
      particle: { emitOnTrigger: true, burstCount: 16, speed: 100, lifetime: 0.8, size: 4, gravity: 500 },
      pathLine: { show: false },
    },
    bloomConfig: { enabled: true, intensity: 1.0, threshold: 0.25, softKnee: 0.6 },
    shaderParams: {
      phosphor_trails: {
        u_ioLineWidth: 4.0,
        u_ioTrailDecay: 0.990,
        u_ioCircleSize: 35.0,
        u_ioBrightness: 0.8,
      },
    },
  }),

  builtIn('Fireworks', {
    config: {
      animationMode: 'Circular',
      scale: 'majorPentatonic',
      numNotes: 36,
      lowNote: 36,
      highNote: 96,
      cycleDuration: 120,
      speedMultiplier: 1.2,
      rotationDirection: 'clockwise',
      backgroundShader: 'fireworks',
    },
    renderConfig: {
      backgroundColor: [0.01, 0.01, 0.02],
      colorScheme: { name: 'fire', saturationMultiplier: 0.8, brightnessMultiplier: 1.0 },
      trail: { mode: 'none' },
      dot: { size: 10, showGlow: true, glowOpacity: 0.7 },
      particle: { emitOnTrigger: true, burstCount: 24, speed: 150, lifetime: 1.0, size: 5, gravity: 1500 },
      pathLine: { show: false },
    },
    bloomConfig: { enabled: true, intensity: 1.2, threshold: 0.2, softKnee: 0.5 },
  }),

  builtIn('Aurora', {
    config: {
      animationMode: 'Pendulum Wave',
      scale: 'harmonicMinor',
      numNotes: 32,
      lowNote: 36,
      highNote: 84,
      cycleDuration: 200,
      speedMultiplier: 0.7,
      rotationDirection: 'clockwise',
      backgroundShader: 'none',
    },
    renderConfig: {
      backgroundColor: [0.01, 0.02, 0.04],
      colorScheme: { name: 'aurora', saturationMultiplier: 0.7, brightnessMultiplier: 0.95 },
      trail: { mode: 'ribbon', width: 8, lifetime: 2.0, opacity: 0.5, fadeExponent: 1.5 },
      dot: { size: 6, showGlow: true, glowOpacity: 0.5 },
      particle: { emitOnTrigger: false },
      pathLine: { show: false },
    },
    bloomConfig: { enabled: true, intensity: 0.9, threshold: 0.25, softKnee: 0.6 },
  }),

  builtIn('Stardust', {
    config: {
      animationMode: 'Rose Curve',
      scale: 'chromatic',
      numNotes: 48,
      lowNote: 28,
      highNote: 96,
      cycleDuration: 150,
      speedMultiplier: 1.0,
      rotationDirection: 'alternating',
      backgroundShader: 'none',
    },
    renderConfig: {
      backgroundColor: [0.02, 0.02, 0.03],
      colorScheme: { name: 'pastel', saturationMultiplier: 0.6, brightnessMultiplier: 0.9 },
      trail: { mode: 'particle', width: 2, lifetime: 1.2, opacity: 0.8, fadeExponent: 2,
        particleSize: 2, particleLifetime: 1.2, particleSpread: 120, particleEjectSpeed: 40 },
      dot: { size: 6, showGlow: true, glowOpacity: 0.5 },
      particle: { emitOnTrigger: true, burstCount: 10, speed: 60, lifetime: 1.2, size: 3, gravity: 0 },
      pathLine: { show: false },
    },
    bloomConfig: { enabled: true, intensity: 1.1, threshold: 0.2, softKnee: 0.5 },
  }),

  builtIn('Deep Ocean', {
    config: {
      animationMode: 'Gravity Pulse',
      scale: 'phrygian',
      numNotes: 24,
      lowNote: 36,
      highNote: 72,
      cycleDuration: 300,
      speedMultiplier: 0.6,
      rotationDirection: 'clockwise',
      backgroundShader: 'none',
    },
    renderConfig: {
      backgroundColor: [0.01, 0.02, 0.05],
      colorScheme: { name: 'ocean', saturationMultiplier: 0.7, brightnessMultiplier: 0.85 },
      trail: { mode: 'ribbon', width: 6, lifetime: 2.5, opacity: 0.5, fadeExponent: 2.5 },
      dot: { size: 14, showGlow: true, glowOpacity: 0.6 },
      particle: { emitOnTrigger: false },
      pathLine: { show: true, opacity: 0.08 },
    },
    bloomConfig: { enabled: true, intensity: 0.7, threshold: 0.3, softKnee: 0.6 },
  }),

  // ── User-contributed presets ────────────────────────────────────

  {
    name: 'Flowers and Particles',
    snapshot: {
      config: {
        numNotes: 20, cycleDuration: 259, speedMultiplier: 1.8, scale: 'yo',
        lowNote: 38, highNote: 84, volume: 0.5, soundEnabled: false, instrument: 'piano',
        dotSize: 12, trailLength: 0.3, pulseOnTrigger: true,
        animationMode: 'Rose Curve', arrangement: 'circular',
        rotationDirection: 'alternating', backgroundShader: 'none',
        modeParams: { petals: 7 },
      },
      renderConfig: {
        backgroundColor: [0.044, 0.100, 0.049],
        dot: { svgFile: 'circle.svg', size: 19, pulseScale: 0.6, showGlow: false, glowFile: 'glow.png', glowScale: 3, glowOpacity: 0.65 },
        trail: { mode: 'particle', width: 11.5, lifetime: 1.3, opacity: 0.30, fadeExponent: 3.6,
          particlesPerSecond: 200, particleSize: 3.5, particleLifetime: 1.5, particleSpread: 175, particleEjectSpeed: 20 },
        pathLine: { show: true, width: 1.5, opacity: 0.47, monochrome: false, color: [0.5, 0.5, 0.5] },
        triggerLine: { show: true, brightness: 0.25, size: 2.7, pulse: true, pulseBrightness: 2.5, monochrome: false, color: [1, 1, 1] },
        noteText: { show: false, duration: 1.5, driftPixels: 30, fontSize: 14, opacity: 0.85 },
        particle: { emitOnTrigger: true, burstCount: 21, speed: 123, lifetime: 0.2, size: 9, drag: 0.5, gravity: 950, spriteFile: 'particle_soft.png' },
        colorScheme: { name: 'sunset', saturationMultiplier: 0.74, brightnessMultiplier: 0.62 },
      },
      bloomConfig: { enabled: true, threshold: 0.41, intensity: 1.45, softKnee: 0.75 },
      shaderParams: {
        phosphor_trails: { u_ioLineWidth: 2.64, u_ioTrailDecay: 0.992, u_ioCircleSize: 41.0, u_ioBrightness: 0.86 },
      },
    },
  },

  {
    name: 'Horizon',
    snapshot: {
      config: {
        numNotes: 33, cycleDuration: 237, speedMultiplier: 1, scale: 'prometheus',
        lowNote: 27, highNote: 91, volume: 0.5, soundEnabled: false, instrument: 'piano',
        dotSize: 12, trailLength: 0.3, pulseOnTrigger: true,
        animationMode: 'Horizontal Bounce', arrangement: 'circular',
        rotationDirection: 'alternating', backgroundShader: 'none',
        modeParams: {},
      },
      renderConfig: {
        backgroundColor: [0.020, 0.002, 0.019],
        dot: { svgFile: 'circle.svg', size: 22, pulseScale: 0.6, showGlow: false, glowFile: 'glow.png', glowScale: 3, glowOpacity: 0.79 },
        trail: { mode: 'none', width: 2.5, lifetime: 2.1, opacity: 0.53, fadeExponent: 1.1,
          particlesPerSecond: 200, particleSize: 5, particleLifetime: 1.3, particleSpread: 137, particleEjectSpeed: 92 },
        pathLine: { show: true, width: 10, opacity: 0.35, monochrome: false, color: [0.5, 0.5, 0.5] },
        triggerLine: { show: true, brightness: 0.25, size: 2.7, pulse: true, pulseBrightness: 2.5, monochrome: false, color: [1, 1, 1] },
        noteText: { show: false, duration: 1.5, driftPixels: 30, fontSize: 14, opacity: 0.85 },
        particle: { emitOnTrigger: true, burstCount: 7, speed: 57, lifetime: 0.4, size: 6, drag: 0.5, gravity: 1900, spriteFile: 'particle_soft.png' },
        colorScheme: { name: 'sunset', saturationMultiplier: 0.32, brightnessMultiplier: 0.99 },
      },
      bloomConfig: { enabled: true, threshold: 0.11, intensity: 1.45, softKnee: 0.42 },
      shaderParams: {
        phosphor_trails: { u_ioLineWidth: 2.64, u_ioTrailDecay: 0.992, u_ioCircleSize: 41.0, u_ioBrightness: 0.86 },
      },
    },
  },
];

// ─── Snapshot helpers ───────────────────────────────────────────────

export function takeSnapshot(
  config: Config, renderConfig: RenderConfig, bloomConfig: BloomConfig,
  getShaderParams: () => Record<string, Record<string, number>>,
): Snapshot {
  return {
    config: structuredClone(config),
    renderConfig: structuredClone(renderConfig),
    bloomConfig: structuredClone(bloomConfig),
    shaderParams: structuredClone(getShaderParams()),
  };
}

export function applySnapshot(
  snapshot: Snapshot,
  config: Config, renderConfig: RenderConfig, bloomConfig: BloomConfig,
  setShaderParams: (params: Record<string, Record<string, number>>) => void,
): void {
  // Config — copy only known keys to avoid stale fields
  // Preserve session-only state that shouldn't be overwritten by presets
  const savedSoundEnabled = config.soundEnabled;
  const savedVolume = config.volume;
  Object.assign(config, snapshot.config);
  config.soundEnabled = savedSoundEnabled;
  config.volume = savedVolume;
  // RenderConfig — deep merge
  Object.assign(renderConfig.backgroundColor, snapshot.renderConfig.backgroundColor);
  Object.assign(renderConfig.dot, snapshot.renderConfig.dot);
  Object.assign(renderConfig.trail, snapshot.renderConfig.trail);
  Object.assign(renderConfig.pathLine, snapshot.renderConfig.pathLine);
  Object.assign(renderConfig.triggerLine, snapshot.renderConfig.triggerLine);
  Object.assign(renderConfig.noteText, snapshot.renderConfig.noteText);
  Object.assign(renderConfig.particle, snapshot.renderConfig.particle);
  Object.assign(renderConfig.colorScheme, snapshot.renderConfig.colorScheme);
  // BloomConfig
  Object.assign(bloomConfig, snapshot.bloomConfig);
  // Shader params
  if (snapshot.shaderParams) {
    setShaderParams(snapshot.shaderParams);
  }
}

// ─── Auto-save (current session) ───────────────────────────────────

export function saveCurrentState(snapshot: Snapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch { /* quota exceeded — silently skip */ }
}

export function loadCurrentState(): Snapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Snapshot : null;
  } catch { return null; }
}

// ─── Named presets ─────────────────────────────────────────────────

export function getPresets(): NamedPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) as NamedPreset[] : [];
  } catch { return []; }
}

function writePresets(presets: NamedPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch { /* quota exceeded */ }
}

export function savePreset(name: string, snapshot: Snapshot): void {
  const presets = getPresets();
  const idx = presets.findIndex(p => p.name === name);
  if (idx >= 0) {
    presets[idx] = { name, snapshot };
  } else {
    presets.push({ name, snapshot });
  }
  writePresets(presets);
}

export function deletePreset(name: string): void {
  writePresets(getPresets().filter(p => p.name !== name));
}
