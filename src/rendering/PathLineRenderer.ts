import { ShaderProgram } from './ShaderProgram.js';
import { hsvToRgb } from './ColorSchemes.js';
import type { DotState, Config, PathLineConfig, TriggerLineConfig } from '../types.js';
import type { CustomModeLoader, ModeContext } from '../animation/CustomModeLoader.js';

const TWO_PI = Math.PI * 2;
const CURVE_SEGMENTS_PER_LOOP = 128;

// Shader with smooth edges for thick lines
const VERT = `#version 300 es
precision highp float;
in vec2 a_position;
in vec4 a_color;
in float a_edgeDistance;
uniform vec2 u_resolution;
out vec4 v_color;
out float v_edgeDistance;
void main() {
  vec2 ndc = (a_position / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_color = a_color;
  v_edgeDistance = a_edgeDistance;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
in float v_edgeDistance;
out vec4 fragColor;
void main() {
  // Smooth fade near edges: 0.5 = fully opaque, >1.0 = fading
  float edgeFade = smoothstep(1.2, 0.5, v_edgeDistance);
  fragColor = vec4(v_color.rgb, v_color.a * edgeFade);
}`;

export class PathLineRenderer {
  private gl: WebGL2RenderingContext;
  private shader: ShaderProgram;

  // Path lines (GL_TRIANGLES)
  private pathVAO: WebGLVertexArrayObject;
  private pathPosBuffer: WebGLBuffer;
  private pathColorBuffer: WebGLBuffer;
  private pathEdgeDistanceBuffer: WebGLBuffer;
  private pathVertCount = 0;

  // Trigger markers (GL_TRIANGLES)
  private triggerVAO: WebGLVertexArrayObject;
  private triggerPosBuffer: WebGLBuffer;
  private triggerColorBuffer: WebGLBuffer;
  private triggerVertCount = 0;

  // Rebuild tracking
  private lastNumDots = -1;
  private lastScreenW = -1;
  private lastScreenH = -1;
  private lastAnimMode = '';
  private lastModeParamsStr = '';
  private lastPathOpacity = -1;
  private lastPathMonochrome = false;
  private lastPathWidth = -1;
  private needsRebuild = true;

  // Reusable context
  private ctx: ModeContext = {
    i: 0, t: 0, speed: 0, cycleProgress: 0, localT: 0, phase: 0,
    cx: 0, cy: 0, maxRadius: 0, amplitude: 0, screenW: 0, screenH: 0, sweep: 0,
  };

  private modeLoader: CustomModeLoader | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.shader = new ShaderProgram(gl, VERT, FRAG);

    // Path VAO
    this.pathVAO = gl.createVertexArray()!;
    this.pathPosBuffer = gl.createBuffer()!;
    this.pathColorBuffer = gl.createBuffer()!;
    this.pathEdgeDistanceBuffer = gl.createBuffer()!;
    this.setupPathVAO();

    // Trigger VAO
    this.triggerVAO = gl.createVertexArray()!;
    this.triggerPosBuffer = gl.createBuffer()!;
    this.triggerColorBuffer = gl.createBuffer()!;
    this.setupVAO(this.triggerVAO, this.triggerPosBuffer, this.triggerColorBuffer);
  }

  setModeLoader(loader: CustomModeLoader): void {
    this.modeLoader = loader;
    this.needsRebuild = true;
  }

  private setupPathVAO(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.pathVAO);

    const aPos = this.shader.getAttribLocation('a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathPosBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const aCol = this.shader.getAttribLocation('a_color');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathColorBuffer);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);

    const aEdgeDist = this.shader.getAttribLocation('a_edgeDistance');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathEdgeDistanceBuffer);
    gl.enableVertexAttribArray(aEdgeDist);
    gl.vertexAttribPointer(aEdgeDist, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private setupVAO(vao: WebGLVertexArrayObject, posBuf: WebGLBuffer, colBuf: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindVertexArray(vao);

    const aPos = this.shader.getAttribLocation('a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const aCol = this.shader.getAttribLocation('a_color');
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  draw(
    dots: DotState[], config: Config,
    pathConfig: PathLineConfig, triggerConfig: TriggerLineConfig,
    canvasW: number, canvasH: number,
  ): void {
    const numDots = dots.length;
    const modeParamsStr = JSON.stringify(config.modeParams);

    const fullRebuild = this.needsRebuild ||
      numDots !== this.lastNumDots ||
      canvasW !== this.lastScreenW || canvasH !== this.lastScreenH ||
      config.animationMode !== this.lastAnimMode ||
      modeParamsStr !== this.lastModeParamsStr ||
      pathConfig.opacity !== this.lastPathOpacity ||
      pathConfig.monochrome !== this.lastPathMonochrome ||
      pathConfig.width !== this.lastPathWidth;

    if (fullRebuild) {
      this.buildPaths(dots, config, pathConfig, canvasW, canvasH);
      this.lastNumDots = numDots;
      this.lastScreenW = canvasW;
      this.lastScreenH = canvasH;
      this.lastAnimMode = config.animationMode;
      this.lastModeParamsStr = modeParamsStr;
      this.lastPathOpacity = pathConfig.opacity;
      this.lastPathMonochrome = pathConfig.monochrome;
      this.lastPathWidth = pathConfig.width;
      this.needsRebuild = false;
    }

    // Trigger markers rebuild every frame when pulsing
    if (triggerConfig.pulse || fullRebuild) {
      this.buildTriggerMarkers(dots, config, triggerConfig, canvasW, canvasH);
    }

    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.shader.use();
    this.shader.set2f('u_resolution', canvasW, canvasH);

    // Draw path lines (as thick quads using triangles)
    if (pathConfig.show && this.pathVertCount > 0) {
      gl.bindVertexArray(this.pathVAO);
      gl.drawArrays(gl.TRIANGLES, 0, this.pathVertCount);
    }

    // Draw trigger markers
    if (triggerConfig.show && this.triggerVertCount > 0) {
      gl.bindVertexArray(this.triggerVAO);
      gl.drawArrays(gl.TRIANGLES, 0, this.triggerVertCount);
    }

    gl.bindVertexArray(null);
  }

  // ─── Path building ────────────────────────────────────────────

  private buildPaths(
    dots: DotState[], config: Config, pathConfig: PathLineConfig,
    canvasW: number, canvasH: number,
  ): void {
    if (!this.modeLoader) { this.pathVertCount = 0; return; }
    const mode = this.modeLoader.getMode(config.animationMode);
    if (!mode) { this.pathVertCount = 0; return; }

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const maxRadius = Math.min(canvasW, canvasH) * 0.45;
    const numDots = dots.length;

    this.modeLoader.setAllParams(this.ctx, mode, config.modeParams);

    // Estimate vertex count for pre-allocation
    const positions: number[] = [];
    const colors: number[] = [];
    const edgeDistances: number[] = [];

    for (let i = 0; i < numDots; i++) {
      const speed = i + 1;
      const dot = dots[i]!;
      const totalSamples = Math.min(CURVE_SEGMENTS_PER_LOOP * speed, 2048);

      this.modeLoader.setContext(this.ctx, mode, i, numDots, speed,
        0, 0, 0, cx, cy, maxRadius, canvasW, canvasH);

      const points = this.modeLoader.samplePath(mode, this.ctx, totalSamples);

      let r: number, g: number, b: number;
      if (pathConfig.monochrome) {
        r = g = b = 0.5;
      } else {
        [r, g, b] = hsvToRgb(dot.hue, dot.saturation, dot.brightness);
      }

      const halfWidth = pathConfig.width * 0.5;
      for (let s = 0; s + 1 < points.length; s++) {
        const p0 = points[s]!;
        const p1 = points[s + 1]!;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;

        const nx = -dy / len;
        const ny = dx / len;
        const ox = nx * halfWidth;
        const oy = ny * halfWidth;

        // Create quad as 2 triangles (separate, not strip)
        // Triangle 1
        positions.push(p0.x + ox, p0.y + oy, p0.x - ox, p0.y - oy, p1.x + ox, p1.y + oy);
        // Triangle 2
        positions.push(p0.x - ox, p0.y - oy, p1.x + ox, p1.y + oy, p1.x - ox, p1.y - oy);

        const c = [r, g, b, pathConfig.opacity];
        colors.push(...c, ...c, ...c, ...c, ...c, ...c);

        // Edge distances: outer vertices fade, inner stay opaque
        // Triangle 1: outer, outer, outer
        edgeDistances.push(1.1, 1.1, 1.1);
        // Triangle 2: outer, outer, outer
        edgeDistances.push(1.1, 1.1, 1.1);
      }
    }

    this.pathVertCount = positions.length / 2;
    this.uploadPathBuffers(positions, colors, edgeDistances);
  }

  // ─── Trigger markers ──────────────────────────────────────────

  private buildTriggerMarkers(
    dots: DotState[], config: Config, triggerConfig: TriggerLineConfig,
    canvasW: number, canvasH: number,
  ): void {
    if (!this.modeLoader) { this.triggerVertCount = 0; return; }
    const mode = this.modeLoader.getMode(config.animationMode);
    if (!mode) { this.triggerVertCount = 0; return; }

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const maxRadius = Math.min(canvasW, canvasH) * 0.45;
    const numDots = dots.length;
    const markerRadius = Math.max(config.dotSize * 0.4, 2) * triggerConfig.size;

    this.modeLoader.setAllParams(this.ctx, mode, config.modeParams);

    // Collect all markers with their draw data
    interface MarkerDraw { x: number; y: number; radius: number; r: number; g: number; b: number; anim: number }
    const allMarkers: MarkerDraw[] = [];

    for (let i = 0; i < numDots; i++) {
      const dot = dots[i]!;
      const anim = triggerConfig.pulse ? dot.triggerAnimation : 0;

      this.modeLoader.setContext(this.ctx, mode, i, numDots, i + 1,
        0, 0, 0, cx, cy, maxRadius, canvasW, canvasH);
      const markers = this.modeLoader.evalMarkers(mode, this.ctx);

      // Find closest marker to the dot (for multi-marker modes)
      let closestIdx = 0;
      if (markers.length > 1) {
        let bestDist = Infinity;
        for (let j = 0; j < markers.length; j++) {
          const dx = markers[j]!.x - dot.position[0];
          const dy = markers[j]!.y - dot.position[1];
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; closestIdx = j; }
        }
      }

      for (let j = 0; j < markers.length; j++) {
        const markerAnim = (j === closestIdx) ? anim : 0;
        const radius = markerRadius * (1 + markerAnim * 0.5);
        const pulseT = Math.min(markerAnim * triggerConfig.pulseBrightness, 1);

        let r: number, g: number, b: number;
        if (triggerConfig.monochrome) {
          const tc = triggerConfig.color;
          r = Math.min(tc[0] + pulseT * (1 - tc[0]), 1);
          g = Math.min(tc[1] + pulseT * (1 - tc[1]), 1);
          b = Math.min(tc[2] + pulseT * (1 - tc[2]), 1);
        } else {
          const baseBri = dot.brightness * triggerConfig.brightness;
          const bri = baseBri + pulseT * (dot.brightness - baseBri);
          const sat = Math.max(dot.saturation * (1 - pulseT * 0.3), 0);
          [r, g, b] = hsvToRgb(dot.hue, sat, Math.min(bri, 1));
        }

        allMarkers.push({ x: markers[j]!.x, y: markers[j]!.y, radius, r, g, b, anim: markerAnim });
      }
    }

    // Sort: lowest animation first so most recently triggered draws on top
    allMarkers.sort((a, b) => a.anim - b.anim);

    // Build triangle fan circles
    const positions: number[] = [];
    const colors: number[] = [];
    const segments = 12;

    for (const m of allMarkers) {
      for (let s = 0; s < segments; s++) {
        const a1 = (s / segments) * TWO_PI;
        const a2 = ((s + 1) / segments) * TWO_PI;

        // Center
        positions.push(m.x, m.y);
        colors.push(m.r, m.g, m.b, 1);
        // Edge 1
        positions.push(m.x + Math.cos(a1) * m.radius, m.y + Math.sin(a1) * m.radius);
        colors.push(m.r, m.g, m.b, 1);
        // Edge 2
        positions.push(m.x + Math.cos(a2) * m.radius, m.y + Math.sin(a2) * m.radius);
        colors.push(m.r, m.g, m.b, 1);
      }
    }

    this.triggerVertCount = positions.length / 2;
    this.uploadBuffers(this.triggerPosBuffer, this.triggerColorBuffer, positions, colors);
  }

  // ─── Buffer upload helper ─────────────────────────────────────

  private uploadPathBuffers(
    positions: number[], colors: number[], edgeDistances: number[],
  ): void {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathEdgeDistanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edgeDistances), gl.DYNAMIC_DRAW);
  }

  private uploadBuffers(
    posBuf: WebGLBuffer, colBuf: WebGLBuffer,
    positions: number[], colors: number[],
  ): void {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.pathVAO);
    gl.deleteVertexArray(this.triggerVAO);
    gl.deleteBuffer(this.pathPosBuffer);
    gl.deleteBuffer(this.pathColorBuffer);
    gl.deleteBuffer(this.pathEdgeDistanceBuffer);
    gl.deleteBuffer(this.triggerPosBuffer);
    gl.deleteBuffer(this.triggerColorBuffer);
    this.shader.dispose();
  }
}
