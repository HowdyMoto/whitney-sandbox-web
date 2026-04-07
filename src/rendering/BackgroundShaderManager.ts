import { ShaderProgram } from './ShaderProgram.js';
import { FBO } from './FBO.js';
import { QuadRenderer } from './QuadRenderer.js';
import type { DotState } from '../types.js';
import type { AudioReactiveData } from '../physics/AudioReactiveData.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ShaderParamType = 'float' | 'bool' | 'int';

export interface ShaderParamDef {
  uniform: string;
  label: string;
  type: ShaderParamType;
  defaultVal: number;
  minVal: number;
  maxVal: number;
  randMin: number;
  randMax: number;
  fmt: string;
}

export interface BackgroundShaderDef {
  key: string;
  displayName: string;
  fragSource: string;        // raw GLSL source
  needsSimulation: boolean;
  isNavierStokes: boolean;
  simSteps: number;
  params: ShaderParamDef[];
  isShadertoy: boolean;      // uses mainImage() convention
}

// ─── Shadertoy compatibility preamble ───────────────────────────────
// Wraps a Shadertoy shader so it works with our uniform system.
// Provides iResolution, iTime, iTimeDelta, iFrame, iMouse, iChannel0-3
// and a main() that calls mainImage().

const SHADERTOY_PREAMBLE = `
// ── Shadertoy compatibility layer ──
uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
uniform vec4  iMouse;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;

// Whitney extras available to all shaders
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_cycleProgress;
uniform vec3  u_backgroundColor;
uniform int   u_numDots;
uniform vec4  u_dots[256];
uniform vec2  u_dotVelocities[256];
uniform float u_dotTrigger[256];
uniform float u_dotNotes[256];
uniform int   u_numTriggerEvents;
uniform vec4  u_triggerEvents[64];
uniform float u_audioAmplitude;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_eqBands[32];
uniform float u_eqPeaks[32];
`;

const SHADERTOY_MAIN = `
out vec4 _fragColor;
void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  mainImage(_fragColor, fragCoord);
}
`;

// For Whitney native shaders (already have main, use v_texCoord)
const NATIVE_PREAMBLE = `
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_cycleProgress;
uniform vec3  u_backgroundColor;
uniform int   u_numDots;
uniform vec4  u_dots[256];
uniform vec2  u_dotVelocities[256];
uniform float u_dotTrigger[256];
uniform float u_dotNotes[256];
uniform int   u_numTriggerEvents;
uniform vec4  u_triggerEvents[64];
uniform float u_audioAmplitude;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_eqBands[32];
uniform float u_eqPeaks[32];

// Shadertoy aliases
uniform vec3  iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int   iFrame;
`;

const FULLSCREEN_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_texCoord;
void main() {
  // v_texCoord (0,0) at top-left to match oF convention
  v_texCoord = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// ─── Metadata parser ────────────────────────────────────────────────

function parseShaderMetadata(source: string): {
  name: string;
  simulation: boolean;
  navierStokes: boolean;
  simSteps: number;
  params: ShaderParamDef[];
  isShadertoy: boolean;
} {
  const lines = source.split('\n');
  let name = '';
  let simulation = false;
  let navierStokes = false;
  let simSteps = 1;
  const params: ShaderParamDef[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('//')) {
      if (trimmed.length > 0) break; // first non-comment non-empty line
      continue;
    }

    const content = trimmed.slice(2).trim();

    if (content.startsWith('@name:')) {
      name = content.slice(6).trim();
    } else if (content.startsWith('@simulation:')) {
      simulation = content.slice(12).trim().toLowerCase() === 'true';
    } else if (content.startsWith('@type:')) {
      if (content.slice(6).trim() === 'navier_stokes') navierStokes = true;
    } else if (content.startsWith('@simsteps:')) {
      simSteps = parseInt(content.slice(10).trim()) || 1;
    } else if (content.startsWith('@param ')) {
      const param = parseParamLine(content.slice(7));
      if (param) params.push(param);
    }
  }

  // Detect Shadertoy convention: has mainImage function
  const isShadertoy = /void\s+mainImage\s*\(/.test(source);

  return { name, simulation, navierStokes, simSteps, params, isShadertoy };
}

function parseParamLine(line: string): ShaderParamDef | null {
  // Format: "u_foo: float, "Label", default=0.5, min=0, max=1, ..."
  const colonIdx = line.indexOf(':');
  if (colonIdx < 0) return null;

  const uniform = line.slice(0, colonIdx).trim();
  const rest = line.slice(colonIdx + 1);

  // Split by comma, but respect quoted strings
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of rest) {
    if (ch === '"') { inQuote = !inQuote; current += ch; }
    else if (ch === ',' && !inQuote) { tokens.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  if (current.trim()) tokens.push(current.trim());

  if (tokens.length < 2) return null;

  const type = tokens[0]!.trim() as ShaderParamType;
  const label = tokens[1]!.replace(/"/g, '').trim();

  const def: ShaderParamDef = {
    uniform, label, type,
    defaultVal: 0, minVal: 0, maxVal: 1,
    randMin: -1, randMax: -1, fmt: '',
  };

  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i]!.trim();
    const eqIdx = t.indexOf('=');
    if (eqIdx < 0) continue;
    const key = t.slice(0, eqIdx).trim();
    let val = t.slice(eqIdx + 1).trim();

    if (key === 'fmt') {
      def.fmt = val.replace(/"/g, '');
      continue;
    }

    if (key === 'default' && type === 'bool') {
      def.defaultVal = (val === 'true' || val === '1') ? 1 : 0;
    } else {
      const num = parseFloat(val);
      if (isNaN(num)) continue;
      switch (key) {
        case 'default': def.defaultVal = num; break;
        case 'min': def.minVal = num; break;
        case 'max': def.maxVal = num; break;
        case 'rand_min': def.randMin = num; break;
        case 'rand_max': def.randMax = num; break;
      }
    }
  }

  if (def.randMin < 0) def.randMin = def.minVal;
  if (def.randMax < 0) def.randMax = def.maxVal;

  return def;
}

// ─── Compile shader with preamble ───────────────────────────────────

function buildFragSource(def: BackgroundShaderDef): string {
  let src = def.fragSource;

  // Strip existing #version if present (we'll add our own)
  src = src.replace(/^\s*#version\s+\d+(\s+\w+)?\s*\n/m, '');

  const version = '#version 300 es\nprecision highp float;\n';

  if (def.isShadertoy) {
    // Shadertoy: wrap mainImage in our main()
    return version + SHADERTOY_PREAMBLE + '\n' + src + '\n' + SHADERTOY_MAIN;
  }

  // Whitney native: inject preamble, keep existing main()
  // Remove any existing uniform declarations that we provide in the preamble
  // This avoids duplicate declarations which cause GLSL errors
  const providedUniforms = [
    'u_resolution', 'u_time', 'u_cycleProgress', 'u_backgroundColor',
    'u_numDots', 'u_dots', 'u_dotVelocities', 'u_dotTrigger', 'u_dotNotes',
    'u_numTriggerEvents', 'u_triggerEvents',
    'u_audioAmplitude', 'u_audioBass', 'u_audioMid', 'u_audioHigh',
    'u_eqBands', 'u_eqPeaks',
    'iResolution', 'iTime', 'iTimeDelta', 'iFrame',
  ];
  for (const name of providedUniforms) {
    // Match: uniform <type> <name>[...]; on its own line
    const re = new RegExp(`^\\s*uniform\\s+\\w+\\s+${name}\\b[^;]*;\\s*\\n?`, 'gm');
    src = src.replace(re, '');
  }

  // Ensure there's an `out vec4` for the fragment output
  if (!/out\s+vec4/.test(src)) {
    src = 'out vec4 fragColor;\n' + src;
    // Replace gl_FragColor references if any
    src = src.replace(/gl_FragColor/g, 'fragColor');
  }

  // Add in texCoord from vertex shader
  if (!/in\s+vec2\s+v_texCoord/.test(src)) {
    src = 'in vec2 v_texCoord;\n' + src;
  }

  return version + NATIVE_PREAMBLE + '\n' + src;
}

// ─── Manager ────────────────────────────────────────────────────────

export class BackgroundShaderManager {
  private gl: WebGL2RenderingContext;
  private quad: QuadRenderer;
  private shaderDefs: BackgroundShaderDef[] = [];
  private compiledShaders = new Map<string, ShaderProgram>();
  private activeShaderKey = 'none';

  // Simulation FBOs (for ping-pong shaders)
  private simFboA: FBO | null = null;
  private simFboB: FBO | null = null;
  private outputFbo: FBO | null = null;
  private displayShader: ShaderProgram | null = null;
  private pingPongFlip = false;

  // State
  private frameCount = 0;
  private prevTime = 0;

  // Shader params: shaderKey → uniformName → value
  private shaderParams = new Map<string, Map<string, number>>();

  // Pre-allocated typed arrays for uniform uploads (avoid per-frame allocation)
  private readonly dotsData = new Float32Array(256 * 4);
  private readonly velsData = new Float32Array(256 * 2);
  private readonly triggerData = new Float32Array(256);
  private readonly notesData = new Float32Array(256);
  private readonly eventsData = new Float32Array(64 * 4);

  // Cached uniform locations per GL program (WebGLProgram → location map)
  private uniformLocCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.quad = new QuadRenderer(gl);
  }

  async loadShaders(urls: string[]): Promise<void> {
    const promises = urls.map(url => this.loadShader(url));
    await Promise.all(promises);
    console.log(`Loaded ${this.shaderDefs.length} background shaders`);
  }

  private async loadShader(url: string): Promise<void> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const source = await resp.text();

      // Derive key from filename
      const filename = url.split('/').pop()!;
      const key = filename.replace('.frag', '');

      // Companion files (_display, NS sub-passes) are compiled but not listed as selectable shaders
      const isCompanion = /_display|_advect|_vorticity|_confine|_divergence|_jacobi|_project|_dye/.test(key);

      const meta = parseShaderMetadata(source);

      // Build a temporary def for compilation
      const tempDef: BackgroundShaderDef = {
        key,
        displayName: meta.name || key,
        fragSource: source,
        needsSimulation: meta.simulation,
        isNavierStokes: meta.navierStokes,
        simSteps: meta.simSteps,
        params: meta.params,
        isShadertoy: meta.isShadertoy,
      };

      // Try to compile (all files, including companions)
      try {
        const fragSrc = buildFragSource(tempDef);
        const program = new ShaderProgram(this.gl, FULLSCREEN_VERT, fragSrc);
        this.compiledShaders.set(key, program);
      } catch (e) {
        console.warn(`Failed to compile shader "${key}":`, e);
      }

      // Only register primary shaders as selectable defs
      if (!isCompanion) {
        this.shaderDefs.push(tempDef);

        const paramMap = new Map<string, number>();
        for (const p of tempDef.params) {
          paramMap.set(p.uniform, p.defaultVal);
        }
        this.shaderParams.set(key, paramMap);
      } else {
        // Merge companion params into parent shader's param map
        // e.g., equalizer_display params go into "equalizer" param map
        const parentKey = key.replace(/_display$/, '');
        let parentParams = this.shaderParams.get(parentKey);
        if (!parentParams) { parentParams = new Map(); this.shaderParams.set(parentKey, parentParams); }
        for (const p of meta.params) {
          if (!parentParams.has(p.uniform)) {
            parentParams.set(p.uniform, p.defaultVal);
          }
        }
        // Also add param defs to parent shader def if it exists
        const parentDef = this.shaderDefs.find(d => d.key === parentKey);
        if (parentDef) {
          for (const p of meta.params) {
            if (!parentDef.params.find(existing => existing.uniform === p.uniform)) {
              parentDef.params.push(p);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to load shader: ${url}`, e);
    }
  }

  // Register a shader from raw source (e.g., pasted Shadertoy code)
  registerShader(key: string, name: string, source: string): boolean {
    const meta = parseShaderMetadata(source);
    const def: BackgroundShaderDef = {
      key, displayName: name, fragSource: source,
      needsSimulation: meta.simulation,
      isNavierStokes: meta.navierStokes,
      simSteps: meta.simSteps,
      params: meta.params,
      isShadertoy: meta.isShadertoy,
    };

    try {
      const fragSrc = buildFragSource(def);
      const program = new ShaderProgram(this.gl, FULLSCREEN_VERT, fragSrc);
      this.compiledShaders.set(key, program);
      this.shaderDefs.push(def);
      const paramMap = new Map<string, number>();
      for (const p of def.params) paramMap.set(p.uniform, p.defaultVal);
      this.shaderParams.set(key, paramMap);
      return true;
    } catch (e) {
      console.warn(`Failed to compile shader "${name}":`, e);
      return false;
    }
  }

  // ─── Queries ────────────────────────────────────────────────────

  getShaderDefs(): BackgroundShaderDef[] { return this.shaderDefs; }
  getActiveKey(): string { return this.activeShaderKey; }

  setActiveShader(key: string): void {
    if (key !== this.activeShaderKey) {
      this.activeShaderKey = key;
      this.pingPongFlip = false;
      this.displayShader = null;
      // Clear sim FBOs on shader change
      if (this.simFboA) { this.simFboA.dispose(); this.simFboA = null; }
      if (this.simFboB) { this.simFboB.dispose(); this.simFboB = null; }
      if (this.outputFbo) { this.outputFbo.dispose(); this.outputFbo = null; }
    }
  }

  getParam(shaderKey: string, uniform: string): number {
    return this.shaderParams.get(shaderKey)?.get(uniform) ?? 0;
  }

  setParam(shaderKey: string, uniform: string, value: number): void {
    let map = this.shaderParams.get(shaderKey);
    if (!map) { map = new Map(); this.shaderParams.set(shaderKey, map); }
    map.set(uniform, value);
  }

  getAllParams(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [shaderKey, map] of this.shaderParams) {
      const obj: Record<string, number> = {};
      for (const [uniform, value] of map) obj[uniform] = value;
      out[shaderKey] = obj;
    }
    return out;
  }

  setAllParams(params: Record<string, Record<string, number>>): void {
    for (const [shaderKey, uniforms] of Object.entries(params)) {
      for (const [uniform, value] of Object.entries(uniforms)) {
        this.setParam(shaderKey, uniform, value);
      }
    }
  }

  // ─── Rendering ──────────────────────────────────────────────────

  render(
    dots: DotState[], currentTime: number, cycleProgress: number,
    bgColor: [number, number, number],
    width: number, height: number,
    targetFBO: FBO | null, // null = render to screen
    audioData?: AudioReactiveData,
  ): void {
    if (this.activeShaderKey === 'none') return;

    const program = this.compiledShaders.get(this.activeShaderKey);
    if (!program) return;

    const def = this.shaderDefs.find(d => d.key === this.activeShaderKey);
    if (!def) return;

    const dt = currentTime - this.prevTime;
    this.prevTime = currentTime;
    this.frameCount++;

    const gl = this.gl;

    if (def.needsSimulation) {
      this.renderSimulation(program, def, dots, currentTime, dt, cycleProgress, bgColor, width, height, targetFBO, audioData);
    } else {
      // Stateless shader — single pass
      if (targetFBO) {
        targetFBO.bind();
      }

      gl.disable(gl.BLEND);
      program.use();
      this.uploadCommonUniforms(program, dots, currentTime, dt, cycleProgress, bgColor, width, height, audioData);
      this.uploadShaderParams(program, def);
      this.quad.draw();

      if (targetFBO) {
        targetFBO.unbind();
      }
    }
  }

  private renderSimulation(
    simProgram: ShaderProgram, def: BackgroundShaderDef,
    dots: DotState[], currentTime: number, dt: number,
    cycleProgress: number, bgColor: [number, number, number],
    width: number, height: number,
    targetFBO: FBO | null,
    audioData?: AudioReactiveData,
  ): void {
    const gl = this.gl;

    // Ensure FBOs exist
    if (!this.simFboA || this.simFboA.width !== width) {
      this.simFboA?.dispose();
      this.simFboB?.dispose();
      this.outputFbo?.dispose();
      this.simFboA = new FBO(gl, width, height, true);
      this.simFboB = new FBO(gl, width, height, true);
      this.outputFbo = new FBO(gl, width, height, false);
      this.pingPongFlip = false;
    }

    // Load display shader if needed
    if (!this.displayShader || this.displayShader === simProgram) {
      const displayKey = def.key + '_display';
      this.displayShader = this.compiledShaders.get(displayKey) ?? null;
    }

    gl.disable(gl.BLEND);

    // Simulation passes
    for (let step = 0; step < def.simSteps; step++) {
      const readFbo = this.pingPongFlip ? this.simFboB! : this.simFboA!;
      const writeFbo = this.pingPongFlip ? this.simFboA! : this.simFboB!;

      writeFbo.bind();
      simProgram.use();

      // Bind previous state
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readFbo.texture);
      simProgram.set1i('u_prevState', 0);
      simProgram.set2f('u_texelSize', 1 / width, 1 / height);

      this.uploadCommonUniforms(simProgram, dots, currentTime, dt, cycleProgress, bgColor, width, height, audioData);
      this.uploadShaderParams(simProgram, def);
      this.quad.draw();

      this.pingPongFlip = !this.pingPongFlip;
    }

    // Display pass
    const stateFbo = this.pingPongFlip ? this.simFboB! : this.simFboA!;
    const displayProgram = this.displayShader ?? simProgram;

    if (targetFBO) {
      targetFBO.bind();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
    }

    displayProgram.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateFbo.texture);
    displayProgram.set1i('u_simState', 0);
    displayProgram.set1i('u_prevState', 0); // alias

    this.uploadCommonUniforms(displayProgram, dots, currentTime, dt, cycleProgress, bgColor, width, height, audioData);
    this.uploadShaderParams(displayProgram, def);
    this.quad.draw();

    if (targetFBO) {
      targetFBO.unbind();
    }

    gl.activeTexture(gl.TEXTURE0);
  }

  // ─── Uniform upload ─────────────────────────────────────────────

  /** Get a uniform location with per-program caching */
  private getCachedLoc(prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    let cache = this.uniformLocCache.get(prog);
    if (!cache) {
      cache = new Map();
      this.uniformLocCache.set(prog, cache);
    }
    if (cache.has(name)) return cache.get(name)!;
    const loc = this.gl.getUniformLocation(prog, name);
    cache.set(name, loc);
    return loc;
  }

  private uploadCommonUniforms(
    program: ShaderProgram, dots: DotState[],
    currentTime: number, dt: number,
    cycleProgress: number, bgColor: [number, number, number],
    width: number, height: number,
    audioData?: AudioReactiveData,
  ): void {
    // Core
    program.set2f('u_resolution', width, height);
    program.set1f('u_time', currentTime);
    program.set1f('u_cycleProgress', cycleProgress);
    program.set3f('u_backgroundColor', bgColor[0], bgColor[1], bgColor[2]);

    // Shadertoy aliases
    program.set3f('iResolution', width, height, 1);
    program.set1f('iTime', currentTime);
    program.set1f('iTimeDelta', dt);
    program.set1i('iFrame', this.frameCount);

    // Dot data (upload as flat arrays via uniform4fv etc.)
    const numDots = Math.min(dots.length, 256);
    program.set1i('u_numDots', numDots);

    const gl = this.gl;
    const prog = program.program;

    // u_dots[i] = vec4(pos.x, pos.y, orbitRadius, hue)
    const dotsLoc = this.getCachedLoc(prog, 'u_dots[0]');
    if (dotsLoc) {
      const data = this.dotsData;
      for (let i = 0; i < numDots; i++) {
        const d = dots[i]!;
        const o = i * 4;
        data[o] = d.position[0];
        data[o + 1] = d.position[1];
        data[o + 2] = d.orbitRadius;
        data[o + 3] = d.hue;
      }
      gl.uniform4fv(dotsLoc, data, 0, numDots * 4);
    }

    // u_dotVelocities[i] = vec2(vx, vy)
    const velsLoc = this.getCachedLoc(prog, 'u_dotVelocities[0]');
    if (velsLoc) {
      const data = this.velsData;
      for (let i = 0; i < numDots; i++) {
        const d = dots[i]!;
        const o = i * 2;
        data[o] = d.velocity[0];
        data[o + 1] = d.velocity[1];
      }
      gl.uniform2fv(velsLoc, data, 0, numDots * 2);
    }

    // u_dotTrigger[i] = float
    const trigLoc = this.getCachedLoc(prog, 'u_dotTrigger[0]');
    if (trigLoc) {
      const data = this.triggerData;
      for (let i = 0; i < numDots; i++) {
        data[i] = dots[i]!.triggerAnimation;
      }
      gl.uniform1fv(trigLoc, data, 0, numDots);
    }

    // u_dotNotes[i] = float (normalized pitch)
    const notesLoc = this.getCachedLoc(prog, 'u_dotNotes[0]');
    if (notesLoc) {
      const data = this.notesData;
      for (let i = 0; i < numDots; i++) {
        data[i] = (dots[i]!.midiNote - 21) / 87;
      }
      gl.uniform1fv(notesLoc, data, 0, numDots);
    }

    // Audio reactive data
    if (audioData) {
      program.set1f('u_audioAmplitude', audioData.amplitude);
      program.set1f('u_audioBass', audioData.bass);
      program.set1f('u_audioMid', audioData.mid);
      program.set1f('u_audioHigh', audioData.high);

      // EQ bands
      const bandsLoc = this.getCachedLoc(prog, 'u_eqBands[0]');
      if (bandsLoc) gl.uniform1fv(bandsLoc, audioData.bands);

      const peaksLoc = this.getCachedLoc(prog, 'u_eqPeaks[0]');
      if (peaksLoc) gl.uniform1fv(peaksLoc, audioData.peaks);

      // Trigger events
      const numEvents = audioData.triggerEvents.length;
      program.set1i('u_numTriggerEvents', numEvents);
      const eventsLoc = this.getCachedLoc(prog, 'u_triggerEvents[0]');
      if (eventsLoc && numEvents > 0) {
        const data = this.eventsData;
        for (let i = 0; i < numEvents; i++) {
          const e = audioData.triggerEvents[i]!;
          const o = i * 4;
          data[o] = e.x;
          data[o + 1] = e.y;
          data[o + 2] = e.hue;
          data[o + 3] = e.birthTime;
        }
        gl.uniform4fv(eventsLoc, data, 0, numEvents * 4);
      }
    } else {
      program.set1f('u_audioAmplitude', 0);
      program.set1f('u_audioBass', 0);
      program.set1f('u_audioMid', 0);
      program.set1f('u_audioHigh', 0);
      program.set1i('u_numTriggerEvents', 0);
    }
  }

  private uploadShaderParams(program: ShaderProgram, def: BackgroundShaderDef): void {
    const params = this.shaderParams.get(def.key);
    if (!params) return;
    for (const [uniform, value] of params) {
      const paramDef = def.params.find(p => p.uniform === uniform);
      if (paramDef?.type === 'int') {
        program.set1i(uniform, Math.round(value));
      } else {
        // Use float for both 'float' and 'bool' types —
        // shaders declare bool params as `uniform float` (0.0/1.0)
        program.set1f(uniform, value);
      }
    }
  }

  isActive(): boolean {
    return this.activeShaderKey !== 'none' && this.compiledShaders.has(this.activeShaderKey);
  }

  dispose(): void {
    for (const [, prog] of this.compiledShaders) prog.dispose();
    this.simFboA?.dispose();
    this.simFboB?.dispose();
    this.outputFbo?.dispose();
    this.displayShader = null;
    this.uniformLocCache.clear();
    this.quad.dispose();
  }
}
