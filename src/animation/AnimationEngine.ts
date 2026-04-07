import type { Config, DotState, TriggerEvent, HSVColor } from '../types.js';
import { getMidiNoteForDot } from '../music/ScaleSystem.js';
import { getColorHSV } from '../rendering/ColorSchemes.js';
import type { CustomModeLoader, CompiledMode, ModeContext } from './CustomModeLoader.js';

const TWO_PI = Math.PI * 2;
const TRIGGER_ANGLE = Math.PI / 2;
const CYCLE_THRESHOLD = 0.015;
const VISUAL_CYCLE_THRESHOLD = 0.005;
const ANIMATION_DECAY = 0.92;

interface Dot {
  index: number;
  speed: number;
  triggered: boolean;
}

interface ModeResult {
  x: number;
  y: number;
  angle: number;
  orbitRadius: number;
  isAtTrigger: boolean;
  isAtVisualTrigger: boolean;
}

export class AnimationEngine {
  private dots: Dot[] = [];
  private lastTriggerState: boolean[] = [];
  private lastVisualTriggerState: boolean[] = [];
  private triggerAnimations: number[] = [];
  private prevPositions: [number, number][] = [];
  private cachedResults: ModeResult[] = [];
  private dotStates: DotState[] = [];
  private firstFrame = true;
  private currentTime = 0;
  private cycleDuration = 240;

  private modeLoader: CustomModeLoader | null = null;
  // Reusable context object to avoid per-frame allocations
  private ctx: ModeContext = {
    i: 0, t: 0, speed: 0, cycleProgress: 0, localT: 0, phase: 0,
    cx: 0, cy: 0, maxRadius: 0, amplitude: 0, screenW: 0, screenH: 0, sweep: 0,
  };

  setModeLoader(loader: CustomModeLoader): void {
    this.modeLoader = loader;
  }

  init(config: Config): void {
    const n = Math.max(1, config.numNotes);
    this.dots = [];
    this.lastTriggerState = [];
    this.lastVisualTriggerState = [];
    this.triggerAnimations = [];
    this.prevPositions = [];
    this.cachedResults = [];
    this.dotStates = [];

    for (let i = 0; i < n; i++) {
      this.dots.push({ index: i, speed: i + 1, triggered: false });
      this.lastTriggerState.push(false);
      this.lastVisualTriggerState.push(false);
      this.triggerAnimations.push(0);
      this.prevPositions.push([0, 0]);
      this.cachedResults.push({ x: 0, y: 0, angle: 0, orbitRadius: 0, isAtTrigger: false, isAtVisualTrigger: false });
      this.dotStates.push(this.emptyDotState(i));
    }

    this.cycleDuration = config.cycleDuration;
    this.firstFrame = true;
  }

  reset(): void {
    this.currentTime = 0;
    this.firstFrame = true;
    for (let i = 0; i < this.dots.length; i++) {
      this.dots[i]!.triggered = false;
      this.lastTriggerState[i] = false;
      this.lastVisualTriggerState[i] = false;
      this.triggerAnimations[i] = 0;
      this.prevPositions[i] = [0, 0];
    }
  }

  getCycleProgress(): number {
    const safeDuration = Math.max(this.cycleDuration, 1);
    return (this.currentTime % safeDuration) / safeDuration;
  }

  getCurrentTime(): number { return this.currentTime; }
  getNumDots(): number { return this.dots.length; }
  getDotStates(): DotState[] { return this.dotStates; }

  update(
    deltaTime: number,
    config: Config,
    colorScheme: string,
    isPlaying: boolean,
    screenW: number,
    screenH: number,
  ): TriggerEvent[] {
    const triggers: TriggerEvent[] = [];
    if (!isPlaying) return triggers;

    this.currentTime += deltaTime * config.speedMultiplier;
    this.cycleDuration = config.cycleDuration;

    if (this.dots.length !== config.numNotes) {
      this.init(config);
    }

    this.updateDots(config, isPlaying, triggers, screenW, screenH);
    this.packRenderData(config, colorScheme, deltaTime);
    this.firstFrame = false;
    return triggers;
  }

  updatePositionsOnly(config: Config, colorScheme: string, screenW: number, screenH: number): void {
    this.cycleDuration = config.cycleDuration;
    if (this.dots.length !== config.numNotes) {
      this.init(config);
    }

    const cycleProgress = this.getCycleProgress();
    const cx = screenW / 2;
    const cy = screenH / 2;
    const maxRadius = Math.min(screenW, screenH) * 0.45;
    const numDots = this.dots.length;

    const mode = this.getCompiledMode(config);

    for (let i = 0; i < numDots; i++) {
      this.cachedResults[i] = this.computeForMode(
        this.dots[i]!, i, numDots, cycleProgress, config, screenW, screenH, cx, cy, maxRadius, mode,
      );
      this.triggerAnimations[i]! *= ANIMATION_DECAY;
    }

    this.packRenderData(config, colorScheme);
  }

  // ─── Private ────────────────────────────────────────────────────

  private getCompiledMode(config: Config): CompiledMode | undefined {
    if (!this.modeLoader) return undefined;
    const mode = this.modeLoader.getMode(config.animationMode);
    if (mode) {
      this.modeLoader.setAllParams(this.ctx, mode, config.modeParams);
    }
    return mode;
  }

  private updateDots(
    config: Config, isPlaying: boolean, triggers: TriggerEvent[],
    screenW: number, screenH: number,
  ): void {
    const cycleProgress = this.getCycleProgress();
    const cx = screenW / 2;
    const cy = screenH / 2;
    const maxRadius = Math.min(screenW, screenH) * 0.45;
    const numDots = this.dots.length;

    const mode = this.getCompiledMode(config);

    for (let i = 0; i < numDots; i++) {
      const dot = this.dots[i]!;
      const result = this.computeForMode(dot, i, numDots, cycleProgress, config, screenW, screenH, cx, cy, maxRadius, mode);
      this.cachedResults[i] = result;

      dot.triggered = result.isAtVisualTrigger;

      if (isPlaying && result.isAtTrigger && !this.lastTriggerState[i]) {
        if (!this.firstFrame || i === 0) {
          triggers.push({
            dotIndex: i,
            midiNote: getMidiNoteForDot(i, config.scale, config.lowNote, config.highNote),
            velocity: 0.57,
          });
        }
      }

      if (isPlaying && result.isAtVisualTrigger && !this.lastVisualTriggerState[i]) {
        if (!this.firstFrame || i === 0) {
          this.triggerAnimations[i] = 1;
        }
      }

      this.lastTriggerState[i] = result.isAtTrigger;
      this.lastVisualTriggerState[i] = result.isAtVisualTrigger;
      this.triggerAnimations[i]! *= ANIMATION_DECAY;
    }
  }

  private getDirectionMultiplier(config: Config, dotIndex: number, cycleProgress: number, speed: number): { multiplier: number; outAngle: number } {
    if (config.rotationDirection === 'pingpong') {
      const rotationsPerCycle = Math.floor(speed);
      const totalRotations = cycleProgress * rotationsPerCycle;
      const completedRotations = Math.floor(totalRotations);
      const rotationProgress = totalRotations - completedRotations;
      const direction = (completedRotations % 2 === 0) ? -1 : 1;
      return { multiplier: 0, outAngle: direction * rotationProgress * TWO_PI };
    }

    if (config.rotationDirection === 'counterclockwise') return { multiplier: 1, outAngle: 0 };
    if (config.rotationDirection === 'alternating') return { multiplier: (dotIndex % 2 === 0) ? -1 : 1, outAngle: 0 };
    return { multiplier: -1, outAngle: 0 };
  }

  private computeForMode(
    dot: Dot, i: number, numDots: number, cycleProgress: number,
    config: Config, screenW: number, screenH: number,
    cx: number, cy: number, maxRadius: number,
    mode?: CompiledMode,
  ): ModeResult {
    const speed = dot.speed;
    const localT = (cycleProgress * speed) % 1;

    // Direction-aware phase
    let phase: number;
    const supportsRotation = mode ? mode.supportsRotation : true;
    if (supportsRotation) {
      const { multiplier: dirMul, outAngle } = this.getDirectionMultiplier(config, i, cycleProgress, speed);
      if (dirMul === 0) {
        phase = TRIGGER_ANGLE + outAngle;
      } else {
        phase = TRIGGER_ANGLE + dirMul * cycleProgress * speed * TWO_PI;
      }
    } else {
      phase = cycleProgress * speed * TWO_PI;
    }

    let x: number, y: number, orbitRadius: number;

    if (mode && this.modeLoader) {
      // Use expression-based mode
      this.modeLoader.setContext(this.ctx, mode, i, numDots, speed,
        cycleProgress, localT, phase, cx, cy, maxRadius, screenW, screenH, config.modeParams);

      const pos = this.modeLoader.evalPosition(mode, this.ctx);
      x = pos.x;
      y = pos.y;
      orbitRadius = this.ctx.amplitude;

      // Trigger detection via mode's trigger expression
      const trigVal = this.modeLoader.evalTriggerValue(mode, this.ctx);
      const isAtTrigger = (trigVal < CYCLE_THRESHOLD) || (trigVal > (1 - CYCLE_THRESHOLD));
      const isAtVisualTrigger = (trigVal < VISUAL_CYCLE_THRESHOLD) || (trigVal > (1 - VISUAL_CYCLE_THRESHOLD));

      return { x, y, angle: phase, orbitRadius, isAtTrigger, isAtVisualTrigger };
    }

    // Fallback: hardcoded Circular
    const t = i / Math.max(numDots, 1);
    const amplitude = maxRadius * (0.15 + t * 0.85);
    x = cx + amplitude * Math.cos(phase);
    y = cy - amplitude * Math.sin(phase);
    orbitRadius = amplitude;

    const trigVal = localT;
    const isAtTrigger = (trigVal < CYCLE_THRESHOLD) || (trigVal > (1 - CYCLE_THRESHOLD));
    const isAtVisualTrigger = (trigVal < VISUAL_CYCLE_THRESHOLD) || (trigVal > (1 - VISUAL_CYCLE_THRESHOLD));

    return { x, y, angle: phase, orbitRadius, isAtTrigger, isAtVisualTrigger };
  }

  private packRenderData(config: Config, colorScheme: string, deltaTime: number = 1 / 60): void {
    const numDots = this.dots.length;
    const isLinearMode = this.modeLoader?.getMode(config.animationMode)?.isLinear ?? false;

    while (this.dotStates.length < numDots) {
      this.dotStates.push(this.emptyDotState(this.dotStates.length));
    }
    this.dotStates.length = numDots;

    for (let i = 0; i < numDots; i++) {
      const dot = this.dots[i]!;
      const result = this.cachedResults[i]!;
      const t = i / Math.max(numDots, 1);

      const hsv: HSVColor = getColorHSV(t, colorScheme, i);

      const currentPos: [number, number] = [result.x, result.y];
      const prev = this.prevPositions[i]!;

      const ds = this.dotStates[i]!;
      ds.index = i;
      ds.position = currentPos;
      ds.velocity = this.firstFrame ? [0, 0] : [(currentPos[0] - prev[0]) / deltaTime, (currentPos[1] - prev[1]) / deltaTime];
      ds.orbitRadius = result.orbitRadius;
      ds.angle = isLinearMode ? 0 : -result.angle;
      ds.hue = hsv.h;
      ds.saturation = hsv.s;
      ds.brightness = hsv.v;
      ds.triggered = dot.triggered;
      ds.triggerAnimation = this.triggerAnimations[i]!;
      ds.speed = dot.speed;
      ds.midiNote = getMidiNoteForDot(i, config.scale, config.lowNote, config.highNote);

      this.prevPositions[i] = [currentPos[0], currentPos[1]];
    }
  }

  private emptyDotState(index: number): DotState {
    return {
      index,
      position: [0, 0],
      velocity: [0, 0],
      orbitRadius: 0,
      angle: 0,
      hue: 0,
      saturation: 0,
      brightness: 0,
      triggered: false,
      triggerAnimation: 0,
      midiNote: -1,
      speed: 1,
    };
  }
}
