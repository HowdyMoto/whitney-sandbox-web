import TOML from '@ltd/j-toml';
import { compileExpression, evaluateExpression, evaluateConstant } from './ExpressionEngine.js';
import type { CompiledExpression } from './ExpressionEngine.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface CustomModeParam {
  name: string;
  label: string;
  defaultVal: number;
  minVal: number;
  maxVal: number;
  step: number;
}

interface MarkerExpr {
  x: CompiledExpression;
  y: CompiledExpression;
}

export interface CompiledMode {
  name: string;
  description: string;
  paramDefs: CustomModeParam[];
  supportsRotation: boolean;
  isLinear: boolean;

  posX: CompiledExpression | null;
  posY: CompiledExpression | null;
  triggerValue: CompiledExpression | null;
  markers: MarkerExpr[];

  pathX: CompiledExpression | null;
  pathY: CompiledExpression | null;
  pathRangeMinExpr: CompiledExpression | null;
  pathRangeMaxExpr: CompiledExpression | null;
  pathRangeMinDefault: number;
  pathRangeMaxDefault: number;
}

// ─── Mode context variables (set per-dot, per-frame) ────────────────

export interface ModeContext {
  i: number;
  t: number;
  speed: number;
  cycleProgress: number;
  localT: number;
  phase: number;
  cx: number;
  cy: number;
  maxRadius: number;
  amplitude: number;
  screenW: number;
  screenH: number;
  sweep: number;
  [key: string]: number;  // custom params
}

// ─── Loader ─────────────────────────────────────────────────────────

const MODE_FILES = [
  'circular', 'epicycle', 'firework', 'gravity_bounce', 'gravity_pulse',
  'horizontal_bounce', 'pendulum_wave', 'rainbow', 'rose_curve',
  'spirograph', 'vertical_bounce',
];

export class CustomModeLoader {
  private modes = new Map<string, CompiledMode>();
  private modeNames: string[] = [];

  async loadAll(): Promise<void> {
    const promises = MODE_FILES.map(f => this.loadMode(`${import.meta.env.BASE_URL}modes/${f}.toml`));
    await Promise.all(promises);
    console.log(`Loaded ${this.modes.size} animation modes`);
  }

  private async loadMode(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const doc = TOML.parse(text, { joiner: '\n' }) as Record<string, unknown>;

      const name = doc['name'] as string;
      if (!name) { console.warn(`Mode missing 'name': ${url}`); return; }

      const mode: CompiledMode = {
        name,
        description: (doc['description'] as string) ?? '',
        supportsRotation: (doc['supportsRotation'] as boolean) ?? true,
        isLinear: (doc['isLinear'] as boolean) ?? false,
        paramDefs: [],
        posX: null, posY: null,
        triggerValue: null,
        markers: [],
        pathX: null, pathY: null,
        pathRangeMinExpr: null, pathRangeMaxExpr: null,
        pathRangeMinDefault: 0,
        pathRangeMaxDefault: Math.PI * 2,
      };

      // Parse params
      const params = doc['params'] as Record<string, Record<string, unknown>> | undefined;
      if (params) {
        for (const [paramName, paramDef] of Object.entries(params)) {
          if (mode.paramDefs.length >= 8) break;
          mode.paramDefs.push({
            name: paramName,
            label: (paramDef['label'] as string) ?? paramName,
            defaultVal: Number(paramDef['default'] ?? 0),
            minVal: Number(paramDef['min'] ?? 0),
            maxVal: Number(paramDef['max'] ?? 1),
            step: Number(paramDef['step'] ?? 0),
          });
        }
      }

      // Compile position
      const position = doc['position'] as Record<string, string> | undefined;
      if (!position) { console.warn(`Mode missing [position]: ${url}`); return; }
      mode.posX = compileExpression(position['x'] ?? 'cx');
      mode.posY = compileExpression(position['y'] ?? 'cy');
      if (!mode.posX || !mode.posY) { console.warn(`Position failed for ${name}`); return; }

      // Compile trigger
      const trigger = doc['trigger'] as Record<string, string> | undefined;
      if (trigger) {
        mode.triggerValue = compileExpression(trigger['value'] ?? 'fmod(cycleProgress * speed, 1.0)');
      }

      // Compile markers
      const marker = doc['marker'] as Record<string, Record<string, string>> | undefined;
      if (marker) {
        // Keys are "1", "2", etc.
        const keys = Object.keys(marker).sort();
        for (const key of keys) {
          const m = marker[key]!;
          const mx = compileExpression(m['x'] ?? 'cx');
          const my = compileExpression(m['y'] ?? 'cy');
          if (mx && my) mode.markers.push({ x: mx, y: my });
        }
      }

      // Compile path
      const path = doc['path'] as Record<string, string> | undefined;
      if (path) {
        mode.pathX = compileExpression(path['x'] ?? 'cx');
        mode.pathY = compileExpression(path['y'] ?? 'cy');

        const rangeMinStr = path['range_min'] ?? '';
        const rangeMaxStr = path['range_max'] ?? '';

        if (rangeMinStr) {
          mode.pathRangeMinExpr = compileExpression(rangeMinStr);
          if (!mode.pathRangeMinExpr) {
            const val = evaluateConstant(rangeMinStr);
            if (val !== null) mode.pathRangeMinDefault = val;
          }
        }
        if (rangeMaxStr) {
          mode.pathRangeMaxExpr = compileExpression(rangeMaxStr);
          if (!mode.pathRangeMaxExpr) {
            const val = evaluateConstant(rangeMaxStr);
            if (val !== null) mode.pathRangeMaxDefault = val;
          }
        }
      }

      this.modes.set(name, mode);
      this.modeNames.push(name);
    } catch (e) {
      console.warn(`Failed to load mode: ${url}`, e);
    }
  }

  // ─── Queries ────────────────────────────────────────────────────

  getModeNames(): string[] { return this.modeNames; }

  getMode(name: string): CompiledMode | undefined {
    return this.modes.get(name);
  }

  // ─── Context setup ─────────────────────────────────────────────

  setContext(
    ctx: ModeContext, _mode: CompiledMode,
    i: number, numDots: number, speed: number,
    cycleProgress: number, localT: number, phase: number,
    cx: number, cy: number, maxRadius: number,
    screenW: number, screenH: number,
  ): void {
    const t = i / Math.max(numDots, 1);
    ctx.i = i;
    ctx.t = t;
    ctx.speed = speed;
    ctx.cycleProgress = cycleProgress;
    ctx.localT = localT;
    ctx.phase = phase;
    ctx.cx = cx;
    ctx.cy = cy;
    ctx.maxRadius = maxRadius;
    ctx.amplitude = maxRadius * (0.15 + t * 0.85);
    ctx.screenW = screenW;
    ctx.screenH = screenH;
    ctx.sweep = 0;
  }

  // ─── Evaluation ─────────────────────────────────────────────────

  evalPosition(mode: CompiledMode, ctx: ModeContext): { x: number; y: number } {
    const x = mode.posX ? evaluateExpression(mode.posX, ctx) : ctx.cx;
    const y = mode.posY ? evaluateExpression(mode.posY, ctx) : ctx.cy;
    return { x, y };
  }

  evalTriggerValue(mode: CompiledMode, ctx: ModeContext): number {
    if (!mode.triggerValue) {
      return (ctx.cycleProgress * ctx.speed) % 1;
    }
    return evaluateExpression(mode.triggerValue, ctx);
  }

  evalMarkers(mode: CompiledMode, ctx: ModeContext): { x: number; y: number }[] {
    return mode.markers.map(m => ({
      x: evaluateExpression(m.x, ctx),
      y: evaluateExpression(m.y, ctx),
    }));
  }

  samplePath(mode: CompiledMode, ctx: ModeContext, numSamples: number): { x: number; y: number }[] {
    // Evaluate range bounds (may depend on per-dot variables)
    const rangeMin = mode.pathRangeMinExpr
      ? evaluateExpression(mode.pathRangeMinExpr, ctx) : mode.pathRangeMinDefault;
    const rangeMax = mode.pathRangeMaxExpr
      ? evaluateExpression(mode.pathRangeMaxExpr, ctx) : mode.pathRangeMaxDefault;

    const points: { x: number; y: number }[] = [];

    if (mode.pathX && mode.pathY) {
      for (let s = 0; s <= numSamples; s++) {
        const sweepT = s / numSamples;
        ctx.sweep = rangeMin + sweepT * (rangeMax - rangeMin);
        points.push({
          x: evaluateExpression(mode.pathX, ctx),
          y: evaluateExpression(mode.pathY, ctx),
        });
      }
    } else if (mode.posX && mode.posY) {
      // Fallback: sweep position expressions over phase
      const savedPhase = ctx.phase;
      for (let s = 0; s <= numSamples; s++) {
        const sweepT = s / numSamples;
        ctx.phase = rangeMin + sweepT * (rangeMax - rangeMin);
        points.push({
          x: evaluateExpression(mode.posX, ctx),
          y: evaluateExpression(mode.posY, ctx),
        });
      }
      ctx.phase = savedPhase;
    }

    return points;
  }

  // ─── Params ─────────────────────────────────────────────────────

  setAllParams(ctx: ModeContext, mode: CompiledMode, params: Record<string, number>): void {
    for (const p of mode.paramDefs) {
      ctx[p.name] = params[p.name] ?? p.defaultVal;
    }
  }

  loadDefaultParams(mode: CompiledMode): Record<string, number> {
    const params: Record<string, number> = {};
    for (const p of mode.paramDefs) {
      params[p.name] = p.defaultVal;
    }
    return params;
  }
}
