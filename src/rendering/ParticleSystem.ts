import { ShaderProgram } from './ShaderProgram.js';
import type { DotState, ParticleConfig, TrailConfig } from '../types.js';
import { hsvToRgb } from './ColorSchemes.js';

const MAX_PARTICLES = 8192;
const TWO_PI = Math.PI * 2;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  r: number; g: number; b: number; a: number;
}

// Same shader as DotRenderer's glow — soft circle quad
const VERT = `#version 300 es
precision highp float;
in vec2 a_quadPos;
in vec2 a_center;
in float a_size;
in vec4 a_color;
uniform vec2 u_resolution;
out vec2 v_uv;
out vec4 v_color;
void main() {
  v_uv = a_quadPos * 0.5 + 0.5;
  v_color = a_color;
  vec2 pos = a_center + a_quadPos * a_size;
  vec2 ndc = (pos / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
out vec4 fragColor;
void main() {
  vec2 d = v_uv - 0.5;
  float dist = length(d) * 2.0;
  float alpha = 1.0 - smoothstep(0.5, 1.0, dist);
  fragColor = vec4(v_color.rgb, v_color.a * alpha);
}`;

// Per instance: centerX, centerY, size, r, g, b, a = 7 floats
const FLOATS_PER_INSTANCE = 7;

export class ParticleSystem {
  private gl: WebGL2RenderingContext;
  private shader: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private quadVBO: WebGLBuffer;
  private instanceVBO: WebGLBuffer;
  private instanceData: Float32Array;

  private particles: Particle[] = [];
  private activeCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.shader = new ShaderProgram(gl, VERT, FRAG);
    this.instanceData = new Float32Array(MAX_PARTICLES * FLOATS_PER_INSTANCE);

    // Allocate particle pool
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, r: 0, g: 0, b: 0, a: 0 });
    }

    // Unit quad
    const quadVerts = new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]);
    this.quadVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    this.instanceVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    const aQuad = this.shader.getAttribLocation('a_quadPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.enableVertexAttribArray(aQuad);
    gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    const stride = FLOATS_PER_INSTANCE * 4;

    const aCenter = this.shader.getAttribLocation('a_center');
    gl.enableVertexAttribArray(aCenter);
    gl.vertexAttribPointer(aCenter, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aCenter, 1);

    const aSize = this.shader.getAttribLocation('a_size');
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(aSize, 1);

    const aColor = this.shader.getAttribLocation('a_color');
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(aColor, 1);

    gl.bindVertexArray(null);
  }

  update(deltaTime: number, config: ParticleConfig): void {
    if (this.activeCount === 0) return;

    // Pre-compute drag factor once for all particles
    const drag = Math.exp(-config.drag * deltaTime);
    const gravDt = config.gravity * deltaTime;
    const particles = this.particles;

    let writeIdx = 0;
    for (let i = 0; i < this.activeCount; i++) {
      const p = particles[i]!;
      p.life -= deltaTime;
      if (p.life <= 0) continue;

      // Physics
      p.vy += gravDt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      // Fade alpha
      p.a = Math.pow(p.life / p.maxLife, 1.5);

      // Compact via reference swap instead of field-by-field copy
      if (writeIdx !== i) {
        const tmp = particles[writeIdx]!;
        particles[writeIdx] = p;
        particles[i] = tmp;
      }
      writeIdx++;
    }
    this.activeCount = writeIdx;
  }

  // Emit burst particles at trigger (matches C++ emit())
  emitBurst(x: number, y: number, vx: number, vy: number, dot: DotState, config: ParticleConfig): void {
    const [r, g, b] = hsvToRgb(dot.hue, dot.saturation, dot.brightness);

    for (let i = 0; i < config.burstCount; i++) {
      if (this.activeCount >= MAX_PARTICLES) break;

      const p = this.particles[this.activeCount]!;
      const angle = Math.random() * TWO_PI;
      const speed = (0.3 + Math.random() * 0.7) * config.speed;

      p.x = x;
      p.y = y;
      p.vx = vx * 0.3 + Math.cos(angle) * speed;
      p.vy = vy * 0.3 + Math.sin(angle) * speed;
      p.life = (0.5 + Math.random() * 0.5) * config.lifetime;
      p.maxLife = p.life;
      p.size = (0.5 + Math.random() * 0.5) * config.size;
      p.r = r; p.g = g; p.b = b; p.a = 1;

      this.activeCount++;
    }
  }

  // Emit single trail particle (matches C++ emitSingle())
  emitTrail(x: number, y: number, vx: number, vy: number, dot: DotState, trailConfig: TrailConfig): void {
    if (this.activeCount >= MAX_PARTICLES) return;

    const [r, g, b] = hsvToRgb(dot.hue, dot.saturation, dot.brightness);
    const p = this.particles[this.activeCount]!;
    p.x = x;
    p.y = y;

    if (trailConfig.particleEjectSpeed > 0 && (vx * vx + vy * vy) > 0.01) {
      const behindAngle = Math.atan2(-vy, -vx);
      const halfSpread = (trailConfig.particleSpread * 0.5) * (Math.PI / 180);
      const angle = behindAngle + (Math.random() * 2 - 1) * halfSpread;
      p.vx = vx + Math.cos(angle) * trailConfig.particleEjectSpeed;
      p.vy = vy + Math.sin(angle) * trailConfig.particleEjectSpeed;
    } else {
      p.vx = vx;
      p.vy = vy;
    }

    p.life = (0.5 + Math.random() * 0.5) * trailConfig.particleLifetime;
    p.maxLife = p.life;
    p.size = (0.4 + Math.random() * 0.6) * trailConfig.particleSize;
    p.r = r; p.g = g; p.b = b; p.a = 1;

    this.activeCount++;
  }

  draw(canvasW: number, canvasH: number): void {
    if (this.activeCount === 0) return;

    const gl = this.gl;
    const data = this.instanceData;

    for (let i = 0; i < this.activeCount; i++) {
      const p = this.particles[i]!;
      const off = i * FLOATS_PER_INSTANCE;
      data[off]     = p.x;
      data[off + 1] = p.y;
      data[off + 2] = p.size;
      data[off + 3] = p.r;
      data[off + 4] = p.g;
      data[off + 5] = p.b;
      data[off + 6] = p.a;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, this.activeCount * FLOATS_PER_INSTANCE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.shader.use();
    this.shader.set2f('u_resolution', canvasW, canvasH);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.activeCount);
    gl.bindVertexArray(null);
  }

  reset(): void {
    this.activeCount = 0;
  }

  getActiveCount(): number { return this.activeCount; }

  dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quadVBO);
    gl.deleteBuffer(this.instanceVBO);
    this.shader.dispose();
  }
}
