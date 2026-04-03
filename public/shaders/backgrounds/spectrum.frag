// @name: Spectrum
// @simulation: false
// @param u_eqBarWidth:    float, "Line Thickness", default=0.7, min=0.2, max=1.0, rand_min=0.3, rand_max=0.9
// @param u_eqGlow:        float, "Glow",           default=1.0, min=0.0, max=3.0, rand_min=0.3, rand_max=2.5
// @param u_eqBrightness:  float, "Brightness",     default=1.0, min=0.3, max=2.0, rand_min=0.5, rand_max=1.8
// @param u_eqMirror:      bool,  "Mirror",         default=false
// @param u_resDecaySpeed: float, "Decay Speed",    default=1.0, min=0.5, max=5.0, rand_min=1.0, rand_max=7.0
// @param u_resPeakFall:   float, "Peak Fall",      default=0.8, min=0.1, max=3.0, rand_min=0.2, rand_max=2.0
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_backgroundColor;
uniform int   u_numDots;
uniform vec4  u_dots[256];
uniform vec2  u_dotVelocities[256];

// Audio-reactive uniforms
uniform float u_audioAmplitude;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_eqBands[32];
uniform float u_eqPeaks[32];

// Tunable parameters
uniform float u_eqBarWidth;     // line thickness
uniform float u_eqGlow;         // glow bloom intensity
uniform float u_eqMirror;       // 0 = bottom only, 1 = mirrored
uniform float u_eqBrightness;   // overall brightness multiplier

const int NUM_BANDS = 32;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Get raw band with clamped index
float getRawBand(int i) {
    return u_eqBands[clamp(i, 0, NUM_BANDS - 1)];
}

float getRawPeak(int i) {
    return u_eqPeaks[clamp(i, 0, NUM_BANDS - 1)];
}

// Smoothed band: weighted average of neighbors for a flowing feel
float getBand(int i) {
    return getRawBand(i-2) * 0.05
         + getRawBand(i-1) * 0.2
         + getRawBand(i)   * 0.5
         + getRawBand(i+1) * 0.2
         + getRawBand(i+2) * 0.05;
}

float getPeak(int i) {
    return getRawPeak(i-2) * 0.05
         + getRawPeak(i-1) * 0.2
         + getRawPeak(i)   * 0.5
         + getRawPeak(i+1) * 0.2
         + getRawPeak(i+2) * 0.05;
}

// Catmull-Rom spline for smooth interpolation between band values
float catmullRom(float p0, float p1, float p2, float p3, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    return 0.5 * (
        (2.0 * p1) +
        (-p0 + p2) * t +
        (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
        (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    );
}

// Get smoothly interpolated height at any x position [0..1]
float sampleCurve(float x) {
    float pos = x * float(NUM_BANDS) - 0.5;
    int i = int(floor(pos));
    float t = fract(pos);

    float val = catmullRom(getBand(i-1), getBand(i), getBand(i+1), getBand(i+2), t);

    // Subtle organic undulation so curve breathes even between hits
    float wave = sin(x * 6.2832 * 2.0 + u_time * 0.4) * 0.008
               + sin(x * 6.2832 * 5.0 - u_time * 0.7) * 0.004;
    val += wave * (0.3 + u_audioAmplitude * 0.7);

    return max(val, 0.0);
}

float samplePeakCurve(float x) {
    float pos = x * float(NUM_BANDS) - 0.5;
    int i = int(floor(pos));
    float t = fract(pos);
    return max(catmullRom(getPeak(i-1), getPeak(i), getPeak(i+1), getPeak(i+2), t), 0.0);
}

void main() {
    vec2 uv = v_texCoord;

    vec3 color = u_backgroundColor;

    // Y axis: 0 = bottom of graph, 1 = top
    float yCoord;
    if (u_eqMirror > 0.5) {
        yCoord = abs(uv.y - 0.5) * 2.0;
    } else {
        yCoord = 1.0 - uv.y;
    }

    // Sample the smooth curves at this x position
    float curveH = sampleCurve(uv.x);
    float peakH  = samplePeakCurve(uv.x);

    // Line thickness in UV space (scaled by bar width control)
    float lineThick = u_eqBarWidth * 0.006;
    float peakLineThick = u_eqBarWidth * 0.003;

    // Hue flows smoothly across x
    float hue = uv.x * 0.75;
    float sat = 0.7;

    // ── Filled area under the curve (smooth gradient body) ──
    if (yCoord < curveH) {
        float fillT = yCoord / max(curveH, 0.001);
        // Smooth ease-in for a wave-body feel rather than linear gradient
        float fillAlpha = 0.12 + fillT * fillT * 0.28;
        float val = (0.3 + fillT * 0.5) * u_eqBrightness;
        vec3 fillColor = hsv2rgb(vec3(hue, sat * (0.6 + fillT * 0.4), val));
        color = mix(color, fillColor, fillAlpha);
    }

    // ── Main spectrum line (bright crest of the wave) ──
    float distToCurve = abs(yCoord - curveH);
    if (curveH > 0.005) {
        float lineGlow = exp(-distToCurve * distToCurve / (lineThick * lineThick));
        float lineCore = smoothstep(lineThick * 0.5, 0.0, distToCurve);
        vec3 lineColor = hsv2rgb(vec3(hue, 0.5, 1.0)) * u_eqBrightness;
        color = mix(color, lineColor, (lineGlow * 0.4 + lineCore * 0.6) * 0.9);
    }

    // ── Peak hold line (thinner, slightly dimmer) ──
    float distToPeak = abs(yCoord - peakH);
    if (peakH > 0.01) {
        float peakGlow = exp(-distToPeak * distToPeak / (peakLineThick * peakLineThick));
        float peakCore = smoothstep(peakLineThick * 0.5, 0.0, distToPeak);
        vec3 peakColor = hsv2rgb(vec3(hue, 0.25, 1.0)) * u_eqBrightness * 0.7;
        color = mix(color, peakColor, (peakGlow * 0.3 + peakCore * 0.5) * 0.8);
    }

    // ── Glow: soft bloom along the curve ──
    if (u_eqGlow > 0.0) {
        // Continuous glow sampled from the curve itself (not per-band)
        float glowRadius = 0.06 * u_eqGlow;
        float glowDist = abs(yCoord - curveH);
        float g = exp(-glowDist * glowDist / (glowRadius * glowRadius));
        vec3 glowColor = hsv2rgb(vec3(hue, 0.5, 1.0));
        color += glowColor * g * curveH * u_eqGlow * u_eqBrightness * 0.35;
    }

    // ── Amplitude-driven background pulse ──
    color += u_backgroundColor * u_audioAmplitude * 0.08;

    // ── Vignette ──
    float vignette = 1.0 - pow(length(uv - 0.5) * 1.2, 3.0);
    color *= clamp(vignette, 0.3, 1.0);

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
