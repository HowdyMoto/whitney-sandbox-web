// ─── Enums ──────────────────────────────────────────────────────────

export type RotationDirection = 'clockwise' | 'counterclockwise' | 'alternating' | 'pingpong';
export type Arrangement = 'circular' | 'spiral' | 'concentric';
export type TrailMode = 'ribbon' | 'particle' | 'none';

export const ROTATION_DIRECTIONS: RotationDirection[] = ['clockwise', 'counterclockwise', 'alternating', 'pingpong'];
export const TRAIL_MODES: TrailMode[] = ['ribbon', 'particle', 'none'];
export const COLOR_SCHEMES = ['rainbow', 'harmonic', 'neon', 'aurora', 'fire', 'pastel', 'mono', 'ocean', 'sunset', 'forest'] as const;

// ─── Core simulation data ───────────────────────────────────────────

export interface DotState {
  index: number;
  position: [number, number];
  velocity: [number, number];
  orbitRadius: number;
  angle: number;
  hue: number;
  saturation: number;
  brightness: number;
  triggered: boolean;
  triggerAnimation: number;
  midiNote: number;
  speed: number;
}

export interface TriggerEvent {
  dotIndex: number;
  midiNote: number;
  velocity: number;
}

// ─── Config (musical / behavioral) ──────────────────────────────────

export interface Config {
  numNotes: number;
  cycleDuration: number;
  speedMultiplier: number;
  scale: string;
  lowNote: number;   // MIDI
  highNote: number;  // MIDI
  volume: number;
  soundEnabled: boolean;
  instrument: string;
  dotSize: number;
  trailLength: number;
  pulseOnTrigger: boolean;
  animationMode: string;
  arrangement: Arrangement;
  rotationDirection: RotationDirection;
  backgroundShader: string;
  modeParams: Record<string, number>;
}

export function defaultConfig(): Config {
  return {
    numNotes: 48,
    cycleDuration: 240,
    speedMultiplier: 1,
    scale: 'chromatic',
    lowNote: 36,
    highNote: 84,
    volume: 0.5,
    soundEnabled: true,
    instrument: 'piano',
    dotSize: 12,
    trailLength: 0.3,
    pulseOnTrigger: true,
    animationMode: 'Circular',
    arrangement: 'circular',
    rotationDirection: 'clockwise',
    backgroundShader: 'none',
    modeParams: {},
  };
}

// ─── Render config (visual) ─────────────────────────────────────────

export interface DotConfig {
  svgFile: string;
  size: number;
  pulseScale: number;
  showGlow: boolean;
  glowFile: string;
  glowScale: number;
  glowOpacity: number;
}

export interface TrailConfig {
  mode: TrailMode;
  width: number;
  lifetime: number;
  opacity: number;
  fadeExponent: number;
  particlesPerSecond: number;
  particleSize: number;
  particleLifetime: number;
  particleSpread: number;
  particleEjectSpeed: number;
}

export interface PathLineConfig {
  show: boolean;
  width: number;
  opacity: number;
  monochrome: boolean;
  color: [number, number, number];
}

export interface TriggerLineConfig {
  show: boolean;
  brightness: number;
  size: number;
  pulse: boolean;
  pulseBrightness: number;
  monochrome: boolean;
  color: [number, number, number];
}

export interface NoteTextConfig {
  show: boolean;
  duration: number;
  driftPixels: number;
  fontSize: number;
  opacity: number;
}

export interface ParticleConfig {
  emitOnTrigger: boolean;
  burstCount: number;
  speed: number;
  lifetime: number;
  size: number;
  drag: number;
  gravity: number;
  spriteFile: string;
}

export interface ColorSchemeConfig {
  name: string;
  saturationMultiplier: number;
  brightnessMultiplier: number;
}

export interface RenderConfig {
  backgroundColor: [number, number, number];
  dot: DotConfig;
  trail: TrailConfig;
  pathLine: PathLineConfig;
  triggerLine: TriggerLineConfig;
  noteText: NoteTextConfig;
  particle: ParticleConfig;
  colorScheme: ColorSchemeConfig;
}

export function defaultRenderConfig(): RenderConfig {
  return {
    backgroundColor: [13 / 255, 13 / 255, 24 / 255],
    dot: {
      svgFile: 'circle.svg',
      size: 12,
      pulseScale: 0.6,
      showGlow: false,
      glowFile: 'glow.png',
      glowScale: 3,
      glowOpacity: 0.5,
    },
    trail: {
      mode: 'ribbon',
      width: 4,
      lifetime: 1,
      opacity: 0.6,
      fadeExponent: 2,
      particlesPerSecond: 50,
      particleSize: 3,
      particleLifetime: 0.8,
      particleSpread: 30,
      particleEjectSpeed: 0,
    },
    pathLine: {
      show: true,
      width: 1,
      opacity: 0.12,
      monochrome: true,
      color: [0.5, 0.5, 0.5],
    },
    triggerLine: {
      show: true,
      brightness: 0.25,
      size: 1,
      pulse: true,
      pulseBrightness: 3,
      monochrome: false,
      color: [1, 1, 1],
    },
    noteText: {
      show: false,
      duration: 1.5,
      driftPixels: 30,
      fontSize: 14,
      opacity: 0.85,
    },
    particle: {
      emitOnTrigger: false,
      burstCount: 12,
      speed: 80,
      lifetime: 0.6,
      size: 4,
      drag: 0.5,
      gravity: 2000,
      spriteFile: 'particle_soft.png',
    },
    colorScheme: {
      name: 'rainbow',
      saturationMultiplier: 0.5,
      brightnessMultiplier: 0.9,
    },
  };
}

// ─── HSV helper ─────────────────────────────────────────────────────

export interface HSVColor {
  h: number;
  s: number;
  v: number;
}
