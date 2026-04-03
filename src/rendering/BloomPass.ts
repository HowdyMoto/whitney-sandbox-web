import { ShaderProgram } from './ShaderProgram.js';
import { FBO } from './FBO.js';
import { QuadRenderer } from './QuadRenderer.js';

// ─── Bloom post-process ─────────────────────────────────────────
// 1. Render scene to HDR FBO (RGBA16F)
// 2. Threshold pass: extract bright pixels
// 3. Dual-pass Gaussian blur at half resolution (horizontal then vertical)
// 4. Repeat blur at quarter resolution for a wider glow
// 5. Composite: original + blurred bloom back to screen

const PASSTHROUGH_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const THRESHOLD_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_scene;
uniform float u_threshold;
uniform float u_softKnee;

void main() {
  vec3 color = texture(u_scene, v_uv).rgb;
  float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
  // Soft knee — smooth transition around threshold
  float knee = u_threshold * u_softKnee;
  float soft = brightness - u_threshold + knee;
  soft = clamp(soft / (2.0 * knee + 0.0001), 0.0, 1.0);
  soft = soft * soft;
  float contribution = max(soft, step(u_threshold, brightness));
  fragColor = vec4(color * contribution, 1.0);
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_source;
uniform vec2 u_direction; // (1/w, 0) for horizontal, (0, 1/h) for vertical

// 9-tap Gaussian: weights for sigma ~4
const float weight[5] = float[](0.227027, 0.194946, 0.121622, 0.054054, 0.016216);

void main() {
  vec3 result = texture(u_source, v_uv).rgb * weight[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = u_direction * float(i);
    result += texture(u_source, v_uv + offset).rgb * weight[i];
    result += texture(u_source, v_uv - offset).rgb * weight[i];
  }
  fragColor = vec4(result, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_scene;
uniform sampler2D u_bloom1;
uniform sampler2D u_bloom2;
uniform float u_bloomIntensity;
uniform float u_bloom2Weight;

void main() {
  vec3 scene = texture(u_scene, v_uv).rgb;
  vec3 bloom1 = texture(u_bloom1, v_uv).rgb;
  vec3 bloom2 = texture(u_bloom2, v_uv).rgb;
  vec3 bloom = bloom1 + bloom2 * u_bloom2Weight;
  vec3 result = scene + bloom * u_bloomIntensity;
  fragColor = vec4(result, 1.0);
}`;

export interface BloomConfig {
  enabled: boolean;
  threshold: number;    // 0.0–1.0, brightness cutoff for bloom
  intensity: number;    // 0.0–3.0, bloom brightness
  softKnee: number;     // 0.0–1.0, soft transition around threshold
}

export function defaultBloomConfig(): BloomConfig {
  return {
    enabled: true,
    threshold: 0.35,
    intensity: 0.6,
    softKnee: 0.5,
  };
}

export class BloomPass {
  private gl: WebGL2RenderingContext;
  private quad: QuadRenderer;

  // Shaders
  private thresholdShader: ShaderProgram;
  private blurShader: ShaderProgram;
  private compositeShader: ShaderProgram;

  // FBOs
  sceneFBO: FBO;             // Full-res scene (RGBA16F for HDR)
  private thresholdFBO: FBO; // Half-res threshold result
  private blurHalfA: FBO;    // Half-res blur ping
  private blurHalfB: FBO;    // Half-res blur pong
  private blurQuarterA: FBO; // Quarter-res blur ping
  private blurQuarterB: FBO; // Quarter-res blur pong

  private width: number;
  private height: number;

  constructor(gl: WebGL2RenderingContext, width: number, height: number) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.quad = new QuadRenderer(gl);

    this.thresholdShader = new ShaderProgram(gl, PASSTHROUGH_VERT, THRESHOLD_FRAG);
    this.blurShader = new ShaderProgram(gl, PASSTHROUGH_VERT, BLUR_FRAG);
    this.compositeShader = new ShaderProgram(gl, PASSTHROUGH_VERT, COMPOSITE_FRAG);

    const hw = Math.max(1, Math.floor(width / 2));
    const hh = Math.max(1, Math.floor(height / 2));
    const qw = Math.max(1, Math.floor(width / 4));
    const qh = Math.max(1, Math.floor(height / 4));

    this.sceneFBO = new FBO(gl, width, height, true);      // RGBA16F
    this.thresholdFBO = new FBO(gl, hw, hh, true);
    this.blurHalfA = new FBO(gl, hw, hh, true);
    this.blurHalfB = new FBO(gl, hw, hh, true);
    this.blurQuarterA = new FBO(gl, qw, qh, true);
    this.blurQuarterB = new FBO(gl, qw, qh, true);
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;

    const hw = Math.max(1, Math.floor(width / 2));
    const hh = Math.max(1, Math.floor(height / 2));
    const qw = Math.max(1, Math.floor(width / 4));
    const qh = Math.max(1, Math.floor(height / 4));

    this.sceneFBO.resize(width, height);
    this.thresholdFBO.resize(hw, hh);
    this.blurHalfA.resize(hw, hh);
    this.blurHalfB.resize(hw, hh);
    this.blurQuarterA.resize(qw, qh);
    this.blurQuarterB.resize(qw, qh);
  }

  // Call this to begin rendering the scene into the HDR FBO
  beginScene(): void {
    this.sceneFBO.bind();
  }

  // After scene is rendered, apply bloom and composite to screen
  apply(config: BloomConfig): void {
    const gl = this.gl;

    gl.disable(gl.BLEND); // Post-process passes don't need blending

    // ─── 1. Threshold pass (full → half res) ────────────────────
    this.thresholdFBO.bind();
    this.thresholdShader.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.texture);
    this.thresholdShader.set1i('u_scene', 0);
    this.thresholdShader.set1f('u_threshold', config.threshold);
    this.thresholdShader.set1f('u_softKnee', config.softKnee);
    this.quad.draw();

    // ─── 2. Blur at half resolution (2 passes) ─────────────────
    this.blurPass(this.thresholdFBO, this.blurHalfA, this.blurHalfB);

    // ─── 3. Blur at quarter resolution (2 passes) ──────────────
    // Downsample half→quarter via threshold FBO trick: just blur the half result further
    this.blurPass(this.blurHalfB, this.blurQuarterA, this.blurQuarterB);

    // ─── 4. Composite: scene + bloom → screen ──────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    this.compositeShader.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.texture);
    this.compositeShader.set1i('u_scene', 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurHalfB.texture);
    this.compositeShader.set1i('u_bloom1', 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.blurQuarterB.texture);
    this.compositeShader.set1i('u_bloom2', 2);

    this.compositeShader.set1f('u_bloomIntensity', config.intensity);
    this.compositeShader.set1f('u_bloom2Weight', 0.7); // wider bloom is softer

    this.quad.draw();

    gl.activeTexture(gl.TEXTURE0);
  }

  private blurPass(src: FBO, pingFBO: FBO, pongFBO: FBO): void {
    const gl = this.gl;
    this.blurShader.use();

    // Horizontal blur: src → ping
    pingFBO.bind();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.texture);
    this.blurShader.set1i('u_source', 0);
    this.blurShader.set2f('u_direction', 1 / pingFBO.width, 0);
    this.quad.draw();

    // Vertical blur: ping → pong
    pongFBO.bind();
    gl.bindTexture(gl.TEXTURE_2D, pingFBO.texture);
    this.blurShader.set2f('u_direction', 0, 1 / pongFBO.height);
    this.quad.draw();
  }

  dispose(): void {
    this.sceneFBO.dispose();
    this.thresholdFBO.dispose();
    this.blurHalfA.dispose();
    this.blurHalfB.dispose();
    this.blurQuarterA.dispose();
    this.blurQuarterB.dispose();
    this.thresholdShader.dispose();
    this.blurShader.dispose();
    this.compositeShader.dispose();
    this.quad.dispose();
  }
}
