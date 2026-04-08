import { ShaderProgram } from './ShaderProgram.js';
import { hsvToRgb, getColorHSV } from './ColorSchemes.js';
import type { DotState, TrailConfig, ColorSchemeConfig } from '../types.js';

const MAX_HISTORY = 256;

interface TrailHistory {
  positions: Float32Array;  // [x0,y0, x1,y1, ...] ring buffer
  timestamps: Float32Array;
  head: number;
  count: number;
}

const VERT = `#version 300 es
precision highp float;
in vec2 a_position;
in vec4 a_color;
uniform vec2 u_resolution;
out vec4 v_color;
void main() {
  vec2 ndc = (a_position / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_color = a_color;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;
void main() {
  fragColor = v_color;
}`;

export class TrailRenderer {
  private gl: WebGL2RenderingContext;
  private shader: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private colBuf: WebGLBuffer;
  private histories: TrailHistory[] = [];
  private currentTime = 0;

  // Pre-allocated per-dot strip buffers
  private posArr = new Float32Array(MAX_HISTORY * 2 * 2);
  private colArr = new Float32Array(MAX_HISTORY * 2 * 4);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.shader = new ShaderProgram(gl, VERT, FRAG);

    this.vao = gl.createVertexArray()!;
    this.posBuf = gl.createBuffer()!;
    this.colBuf = gl.createBuffer()!;

    gl.bindVertexArray(this.vao);

    const aPos = this.shader.getAttribLocation('a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.posArr.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const aCol = this.shader.getAttribLocation('a_color');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.colArr.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  reset(): void {
    for (const h of this.histories) {
      h.head = 0;
      h.count = 0;
    }
    this.currentTime = 0;
  }

  update(deltaTime: number, dots: DotState[]): void {
    this.currentTime += deltaTime;

    while (this.histories.length < dots.length) {
      this.histories.push({
        positions: new Float32Array(MAX_HISTORY * 2),
        timestamps: new Float32Array(MAX_HISTORY),
        head: 0,
        count: 0,
      });
    }
    this.histories.length = dots.length;

    for (let i = 0; i < dots.length; i++) {
      const h = this.histories[i]!;
      const d = dots[i]!;
      h.positions[h.head * 2] = d.position[0];
      h.positions[h.head * 2 + 1] = d.position[1];
      h.timestamps[h.head] = this.currentTime;
      h.head = (h.head + 1) % MAX_HISTORY;
      if (h.count < MAX_HISTORY) h.count++;
    }
  }

  draw(
    dots: DotState[], config: TrailConfig, colorScheme: ColorSchemeConfig,
    canvasW: number, canvasH: number,
  ): void {
    if (config.mode !== 'ribbon') return;

    const gl = this.gl;
    const numDots = dots.length;
    if (numDots === 0) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.shader.use();
    this.shader.set2f('u_resolution', canvasW, canvasH);
    gl.bindVertexArray(this.vao);

    const posArr = this.posArr;
    const colArr = this.colArr;

    const halfWidth = config.width * 0.5;
    const lifetime = config.lifetime;
    const fadeExp = config.fadeExponent;
    const opacity = config.opacity;
    const invNumDots = 1 / Math.max(numDots, 1);
    // Break trail when a dot teleports (e.g. one-way sweep wrap)
    const teleportThresh = Math.min(canvasW, canvasH) * 0.25;
    const teleportThreshSq = teleportThresh * teleportThresh;

    for (let d = 0; d < numDots; d++) {
      const history = this.histories[d];
      if (!history || history.count < 2) continue;

      const t = d * invNumDots;
      const hsv = getColorHSV(t, colorScheme.name, d);
      const sat = Math.min(hsv.s * colorScheme.saturationMultiplier, 1);
      const bri = Math.min(hsv.v * colorScheme.brightnessMultiplier, 1);
      const [cr, cg, cb] = hsvToRgb(hsv.h, sat, bri);

      let prevX = dots[d]!.position[0];
      let prevY = dots[d]!.position[1];

      // Inline ring buffer index: compute base once, decrement per iteration
      const positions = history.positions;
      const timestamps = history.timestamps;
      let ringIdx = (history.head - 1 + MAX_HISTORY) % MAX_HISTORY;
      const newestTime = timestamps[ringIdx]!;

      let vertCount = 0;

      for (let p = 0; p < history.count; p++) {
        const px = positions[ringIdx * 2]!;
        const py = positions[ringIdx * 2 + 1]!;
        const age = newestTime - timestamps[ringIdx]!;

        if (age > lifetime) break;

        const dx = px - prevX;
        const dy = py - prevY;
        const distSq = dx * dx + dy * dy;
        if (distSq > teleportThreshSq) break; // teleport — stop trail here
        const len = Math.sqrt(distSq);
        if (len < 0.001) {
          prevX = px; prevY = py;
          ringIdx = (ringIdx - 1 + MAX_HISTORY) % MAX_HISTORY;
          continue;
        }

        const fadeFactor = age / lifetime;
        const alpha = Math.pow(1 - fadeFactor, fadeExp) * opacity;
        const w = halfWidth * (1 - fadeFactor * 0.5);
        const invLen = 1 / len;
        const nx = -dy * invLen;
        const ny = dx * invLen;

        const off2 = vertCount * 2;
        const off4 = vertCount * 4;
        posArr[off2]     = px + nx * w;
        posArr[off2 + 1] = py + ny * w;
        posArr[off2 + 2] = px - nx * w;
        posArr[off2 + 3] = py - ny * w;
        colArr[off4]     = cr; colArr[off4 + 1] = cg; colArr[off4 + 2] = cb; colArr[off4 + 3] = alpha;
        colArr[off4 + 4] = cr; colArr[off4 + 5] = cg; colArr[off4 + 6] = cb; colArr[off4 + 7] = alpha;

        vertCount += 2;
        prevX = px;
        prevY = py;
        ringIdx = (ringIdx - 1 + MAX_HISTORY) % MAX_HISTORY;
      }

      if (vertCount < 4) continue;

      const posLen = vertCount * 2;
      const colLen = vertCount * 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, posArr, 0, posLen);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, colArr, 0, colLen);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount);
    }

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.colBuf);
    this.shader.dispose();
  }
}
