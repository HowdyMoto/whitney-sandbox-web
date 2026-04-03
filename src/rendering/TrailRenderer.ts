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
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const aCol = this.shader.getAttribLocation('a_color');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
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

    for (let d = 0; d < numDots; d++) {
      const history = this.histories[d];
      if (!history || history.count < 2) continue;

      const t = d / Math.max(numDots, 1);
      const hsv = getColorHSV(t, colorScheme.name, d);
      const sat = Math.min(hsv.s * colorScheme.saturationMultiplier, 1);
      const bri = Math.min(hsv.v * colorScheme.brightnessMultiplier, 1);
      const [cr, cg, cb] = hsvToRgb(hsv.h, sat, bri);

      const halfWidth = config.width * 0.5;
      let prevX = dots[d]!.position[0];
      let prevY = dots[d]!.position[1];
      const newestTime = this.getTimestamp(history, 0);

      let vertCount = 0;

      for (let p = 0; p < history.count; p++) {
        const px = this.getPositionX(history, p);
        const py = this.getPositionY(history, p);
        const age = newestTime - this.getTimestamp(history, p);

        if (age > config.lifetime) break;

        const dx = px - prevX;
        const dy = py - prevY;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) { prevX = px; prevY = py; continue; }

        const fadeFactor = age / config.lifetime;
        const alpha = Math.pow(1 - fadeFactor, config.fadeExponent) * config.opacity;
        const w = halfWidth * (1 - fadeFactor * 0.5);
        const nx = -dy / len;
        const ny = dx / len;

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
      }

      if (vertCount < 4) continue;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, posArr.subarray(0, vertCount * 2), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, colArr.subarray(0, vertCount * 4), gl.DYNAMIC_DRAW);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount);
    }

    gl.bindVertexArray(null);
  }

  // Ring buffer access: index 0 = most recent, count-1 = oldest
  private getPositionX(h: TrailHistory, idx: number): number {
    const actual = ((h.head - 1 - idx) % MAX_HISTORY + MAX_HISTORY) % MAX_HISTORY;
    return h.positions[actual * 2]!;
  }

  private getPositionY(h: TrailHistory, idx: number): number {
    const actual = ((h.head - 1 - idx) % MAX_HISTORY + MAX_HISTORY) % MAX_HISTORY;
    return h.positions[actual * 2 + 1]!;
  }

  private getTimestamp(h: TrailHistory, idx: number): number {
    const actual = ((h.head - 1 - idx) % MAX_HISTORY + MAX_HISTORY) % MAX_HISTORY;
    return h.timestamps[actual]!;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.colBuf);
    this.shader.dispose();
  }
}
