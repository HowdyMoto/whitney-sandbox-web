// @name: Kaleidoscope
// @simulation: false
// @param u_kalSegments:    int,   "Segments",         default=8,    min=3,   max=16
// @param u_kalZoom:        float, "Zoom",             default=1.5,  min=1.0, max=5.0,  rand_min=1.5, rand_max=4.0
// @param u_kalBrightness:  float, "Brightness",       default=0.5,  min=0.1, max=1.0,  rand_min=0.2, rand_max=0.8
// @param u_kalReactivity:  float, "Music Reactivity", default=0.8,  min=0.0, max=1.5,  rand_min=0.2, rand_max=1.2
// @param u_kalComplexity:  float, "Pattern Detail",   default=1.0,  min=0.3, max=2.0,  rand_min=0.5, rand_max=1.5
// @param u_kalGlowSize:    float, "Glow Size",        default=1.0,  min=0.3, max=3.0,  rand_min=0.5, rand_max=2.0
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_backgroundColor;
uniform int   u_numDots;
uniform vec4  u_dots[256];
uniform float u_dotNotes[256];
uniform float u_dotTrigger[256];
uniform int   u_numTriggerEvents;
uniform vec4  u_triggerEvents[64];
uniform float u_audioAmplitude;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_eqBands[32];

uniform int   u_kalSegments;
uniform float u_kalZoom;
uniform float u_kalBrightness;
uniform float u_kalReactivity;
uniform float u_kalComplexity;
uniform float u_kalGlowSize;

const float PI  = 3.14159265;
const float TAU = 6.28318530;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Kaleidoscope: fold a point into one mirrored segment
vec2 kaleidoscope(vec2 p, int segments) {
    float segAngle = TAU / float(segments);
    float rawAngle = atan(p.y, p.x);
    float angle = mod(rawAngle, segAngle);

    // Mirror alternating segments
    if (mod(floor(rawAngle / segAngle), 2.0) > 0.5) {
        angle = segAngle - angle;
    }

    float r = length(p);
    return vec2(cos(angle), sin(angle)) * r;
}

void main() {
    vec2 uv = v_texCoord;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 pixel = uv * u_resolution;

    // Centered, aspect-corrected
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    vec3 color = u_backgroundColor;

    // NO time-based rotation — the pattern is the dots themselves
    // Fold the pixel into kaleidoscope space
    vec2 kp = kaleidoscope(p, u_kalSegments) * u_kalZoom;

    float glowSigma = 0.01 * u_kalGlowSize;
    float glowSigma2 = glowSigma * glowSigma;

    // === Core: each dot is reflected through the kaleidoscope ===
    // The dots ARE the pattern — their motion creates the visual change
    for (int i = 0; i < min(u_numDots, 64); i++) {
        vec2 dotP = (u_dots[i].xy / u_resolution - 0.5) * vec2(aspect, 1.0);
        vec2 dotK = kaleidoscope(dotP, u_kalSegments) * u_kalZoom;

        float hue = u_dots[i].w;
        float trig = u_dotTrigger[i];
        float note = u_dotNotes[i];

        vec2 diff = kp - dotK;
        float dist2 = dot(diff, diff);

        // Dot glow — size varies with trigger and pitch
        float size = glowSigma2 * (1.0 + trig * u_kalReactivity * 3.0);
        float glow = exp(-dist2 / size);

        // Brighter on trigger
        float intensity = (0.3 + trig * u_kalReactivity * 2.0) * u_kalBrightness;

        // Outer halo
        float haloSize = size * 6.0;
        float halo = exp(-dist2 / haloSize) * 0.15;

        vec3 dotColor = hsv2rgb(vec3(hue, 0.7 - trig * 0.3, 1.0));
        color += dotColor * (glow * intensity + halo * u_kalBrightness);
    }

    // === Connections between nearby dots in kaleidoscope space ===
    int maxConn = min(u_numDots, 24);
    for (int i = 0; i < maxConn; i++) {
        vec2 dotA = kaleidoscope(
            (u_dots[i].xy / u_resolution - 0.5) * vec2(aspect, 1.0),
            u_kalSegments) * u_kalZoom;

        for (int j = i + 1; j < maxConn; j++) {
            vec2 dotB = kaleidoscope(
                (u_dots[j].xy / u_resolution - 0.5) * vec2(aspect, 1.0),
                u_kalSegments) * u_kalZoom;

            float pairDist = length(dotA - dotB);
            if (pairDist > 0.5 * u_kalComplexity || pairDist < 0.005) continue;

            // Bounding box
            float margin = glowSigma * 4.0;
            vec2 mn = min(dotA, dotB) - vec2(margin);
            vec2 mx = max(dotA, dotB) + vec2(margin);
            if (kp.x < mn.x || kp.x > mx.x || kp.y < mn.y || kp.y > mx.y) continue;

            // Line distance
            vec2 ab = dotB - dotA;
            float len2 = dot(ab, ab);
            float t = clamp(dot(kp - dotA, ab) / len2, 0.0, 1.0);
            vec2 proj = dotA + t * ab;
            float perpDist = length(kp - proj);

            float lineW = glowSigma * 0.5;
            float lineGlow = exp(-perpDist * perpDist / (lineW * lineW));

            // Fade with distance between dots
            float distFade = 1.0 - smoothstep(0.2 * u_kalComplexity, 0.5 * u_kalComplexity, pairDist);

            // Brighter when either dot is triggered
            float trigMax = max(u_dotTrigger[i], u_dotTrigger[j]);
            float connIntensity = lineGlow * distFade * (0.1 + trigMax * u_kalReactivity) * u_kalBrightness * 0.5;

            // Blend hues along connection
            float hueA = u_dots[i].w, hueB = u_dots[j].w;
            float hueDiff = hueB - hueA;
            if (hueDiff > 0.5) hueDiff -= 1.0;
            if (hueDiff < -0.5) hueDiff += 1.0;
            float hue = fract(hueA + hueDiff * t);

            color += hsv2rgb(vec3(hue, 0.5, 1.0)) * connIntensity;
        }
    }

    // === Audio-reactive concentric rings ===
    float r = length(kp);
    for (int b = 0; b < 8; b++) {
        float bandEnergy = u_eqBands[b * 4] * u_kalReactivity;
        if (bandEnergy < 0.02) continue;

        float ringR = (float(b) + 1.0) * 0.06 * u_kalComplexity;
        float ringW = 0.005 + bandEnergy * 0.01;
        float ringD = abs(r - ringR);
        float ring = exp(-ringD * ringD / (ringW * ringW)) * bandEnergy * u_kalBrightness * 0.3;

        float ringHue = float(b) / 8.0;
        color += hsv2rgb(vec3(ringHue, 0.4, 1.0)) * ring;
    }

    // === Trigger events — bursts at trigger positions ===
    for (int i = 0; i < u_numTriggerEvents; i++) {
        float age = u_time - u_triggerEvents[i].w;
        if (age < 0.0 || age > 1.5) continue;

        vec2 evP = (u_triggerEvents[i].xy / u_resolution - 0.5) * vec2(aspect, 1.0);
        vec2 evK = kaleidoscope(evP, u_kalSegments) * u_kalZoom;

        float dist = length(kp - evK);

        // Expanding ring
        float ringR = age * 0.2;
        float ringD = abs(dist - ringR);
        float ring = exp(-ringD * ringD / (glowSigma2 * 2.0)) * exp(-age * 3.0);

        // Flash at center
        float flash = exp(-dist * dist / (glowSigma2 * 4.0)) * exp(-age * 6.0);

        float evHue = u_triggerEvents[i].z;
        color += hsv2rgb(vec3(evHue, 0.4, 1.0)) * (ring + flash) * u_kalReactivity * u_kalBrightness;
    }

    // Center glow — breathes with bass
    float centerGlow = exp(-dot(p, p) * 8.0) * u_kalBrightness * 0.08;
    centerGlow *= 1.0 + u_audioBass * u_kalReactivity * 1.5;
    color += vec3(1.0, 0.95, 0.9) * centerGlow;

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
