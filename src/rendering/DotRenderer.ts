import { ShaderProgram } from './ShaderProgram.js';
import { hsvToRgb } from './ColorSchemes.js';
import type { DotState, RenderConfig } from '../types.js';

// ─── Shaders ────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;

// Per-vertex (unit quad)
in vec2 a_quadPos;

// Per-instance
in vec2 a_center;
in float a_size;
in vec4 a_color;

uniform vec2 u_resolution;

out vec2 v_uv;
out vec4 v_color;

void main() {
  v_uv = a_quadPos * 0.5 + 0.5;  // [0,1]
  v_color = a_color;

  vec2 pos = a_center + a_quadPos * a_size;
  // Convert pixel coords to clip space: (0,0)=top-left
  vec2 ndc = (pos / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;  // flip y so (0,0) is top-left
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

out vec4 fragColor;

void main() {
  // Soft circle (procedural dot texture)
  vec2 d = v_uv - 0.5;
  float dist = length(d) * 2.0;  // 0 at center, 1 at edge
  float alpha = 1.0 - smoothstep(0.7, 1.0, dist);
  fragColor = vec4(v_color.rgb, v_color.a * alpha);
}`;

const GLOW_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

out vec4 fragColor;

void main() {
  vec2 d = v_uv - 0.5;
  float dist = length(d) * 2.0;
  // Gaussian-like falloff for glow
  float alpha = exp(-dist * dist * 3.0);
  fragColor = vec4(v_color.rgb, v_color.a * alpha);
}`;

// ─── Instance data layout ───────────────────────────────────────────
// Per instance: centerX, centerY, size, r, g, b, a = 7 floats
const FLOATS_PER_INSTANCE = 7;
const MAX_DOTS = 256;

export class DotRenderer {
  private gl: WebGL2RenderingContext;
  private coreShader: ShaderProgram;
  private glowShader: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private quadVBO: WebGLBuffer;
  private instanceVBO: WebGLBuffer;
  private instanceData: Float32Array;
  // Pre-computed per-dot colors (RGB), reused across glow + core passes
  private dotColors: Float32Array;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.coreShader = new ShaderProgram(gl, VERT, FRAG);
    this.glowShader = new ShaderProgram(gl, VERT, GLOW_FRAG);
    this.instanceData = new Float32Array(MAX_DOTS * FLOATS_PER_INSTANCE);
    this.dotColors = new Float32Array(MAX_DOTS * 3); // r,g,b per dot

    // Unit quad: 2 triangles covering [-1,1]
    const quadVerts = new Float32Array([
      -1, -1,   1, -1,   1,  1,
      -1, -1,   1,  1,  -1,  1,
    ]);

    this.quadVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    this.instanceVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    // Build VAO using the core shader's attribute locations
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.setupAttributes(this.coreShader);
    gl.bindVertexArray(null);
  }

  private setupAttributes(shader: ShaderProgram): void {
    const gl = this.gl;

    // Quad vertex positions (per-vertex)
    const aQuad = shader.getAttribLocation('a_quadPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.enableVertexAttribArray(aQuad);
    gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);

    // Instance attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    const stride = FLOATS_PER_INSTANCE * 4;

    const aCenter = shader.getAttribLocation('a_center');
    gl.enableVertexAttribArray(aCenter);
    gl.vertexAttribPointer(aCenter, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aCenter, 1);

    const aSize = shader.getAttribLocation('a_size');
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(aSize, 1);

    const aColor = shader.getAttribLocation('a_color');
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(aColor, 1);
  }

  draw(dots: DotState[], renderConfig: RenderConfig, canvasWidth: number, canvasHeight: number): void {
    if (dots.length === 0) return;

    const gl = this.gl;
    const dotCfg = renderConfig.dot;
    const csCfg = renderConfig.colorScheme;

    // ─── Compute base colors once (shared by glow + core) ───────
    this.computeDotColors(dots, csCfg);

    // ─── Glow pass (additive blend) ─────────────────────────────
    if (dotCfg.showGlow) {
      this.fillInstanceData(dots, dotCfg.size * dotCfg.glowScale, true, dotCfg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, dots.length * FLOATS_PER_INSTANCE);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
      this.glowShader.use();
      this.glowShader.set2f('u_resolution', canvasWidth, canvasHeight);
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, dots.length);
    }

    // ─── Core dot pass (alpha blend) ────────────────────────────
    this.fillInstanceData(dots, dotCfg.size, false, dotCfg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, dots.length * FLOATS_PER_INSTANCE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // standard alpha
    this.coreShader.use();
    this.coreShader.set2f('u_resolution', canvasWidth, canvasHeight);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, dots.length);

    gl.bindVertexArray(null);
  }

  /** Compute HSV→RGB once per dot, store in this.dotColors for reuse across passes */
  private computeDotColors(
    dots: DotState[],
    colorScheme: { saturationMultiplier: number; brightnessMultiplier: number },
  ): void {
    const colors = this.dotColors;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      const sat = d.saturation * colorScheme.saturationMultiplier;
      const bri = d.brightness * colorScheme.brightnessMultiplier;
      const [r, g, b] = hsvToRgb(d.hue, Math.min(sat, 1), Math.min(bri, 1));
      const ci = i * 3;
      colors[ci] = r;
      colors[ci + 1] = g;
      colors[ci + 2] = b;
    }
  }

  private fillInstanceData(
    dots: DotState[],
    baseSize: number,
    isGlow: boolean,
    dotCfg: { pulseScale: number; glowOpacity: number },
  ): void {
    const data = this.instanceData;
    const colors = this.dotColors;

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      const offset = i * FLOATS_PER_INSTANCE;
      const ci = i * 3;

      // Size with pulse
      let size = baseSize;
      if (!isGlow) {
        size *= (1 + d.triggerAnimation * dotCfg.pulseScale);
      }

      // Read pre-computed base color
      let r = colors[ci]!;
      let g = colors[ci + 1]!;
      let b = colors[ci + 2]!;

      // Trigger flash toward white (core pass only)
      if (!isGlow && d.triggerAnimation > 0.01) {
        const flash = d.triggerAnimation * 0.3;
        r += (1 - r) * flash;
        g += (1 - g) * flash;
        b += (1 - b) * flash;
      }

      // Alpha
      let alpha = 1.0;
      if (isGlow) {
        alpha = dotCfg.glowOpacity * (0.5 + d.triggerAnimation * 0.5);
      }

      data[offset]     = d.position[0];
      data[offset + 1] = d.position[1];
      data[offset + 2] = size;
      data[offset + 3] = r;
      data[offset + 4] = g;
      data[offset + 5] = b;
      data[offset + 6] = alpha;
    }
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quadVBO);
    gl.deleteBuffer(this.instanceVBO);
    this.coreShader.dispose();
    this.glowShader.dispose();
  }
}
