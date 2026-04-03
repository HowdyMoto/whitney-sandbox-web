// @name: Fractal Bloom
// @simulation: false
// @param u_fbDepth:      float, "Fractal Depth",    default=0.7,  min=0.3, max=1.0,  rand_min=0.4, rand_max=1.0
// @param u_fbBrightness: float, "Brightness",       default=0.6,  min=0.1, max=1.0,  rand_min=0.3, rand_max=0.8
// @param u_fbZoom:       float, "Zoom",             default=1.0,  min=0.3, max=2.5,  rand_min=0.5, rand_max=2.0
// @param u_fbSpeed:      float, "Rotation Speed",   default=1.0,  min=0.0, max=3.0,  rand_min=0.2, rand_max=2.0
// @param u_fbReactivity: float, "Music Reactivity", default=0.15, min=0.0, max=0.25, rand_min=0.05, rand_max=0.25
// @param u_fbShadow:     float, "Shadow Strength",  default=0.7,  min=0.0, max=1.0,  rand_min=0.3, rand_max=0.9
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
uniform vec2  u_dotVelocities[256];
uniform int   u_numTriggerEvents;
uniform vec4  u_triggerEvents[64];
uniform float u_audioAmplitude;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_eqBands[32];

uniform float u_fbDepth;
uniform float u_fbBrightness;
uniform float u_fbZoom;
uniform float u_fbSpeed;
uniform float u_fbReactivity;
uniform float u_fbShadow;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Rotation matrix from angle
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, s, -s, c);
}

// --- Fractal state driven by dots ---
// These are set once per frame in main() and used by map()
mat2 mA, mB, mC;
vec4 lightPos;  // .xyz = position, .w = radius
float fractalScale;

float map(vec3 p) {
    // Light sphere
    float d = length(p - lightPos.xyz) - lightPos.w;
    // Back wall
    d = min(d, max(10.0 - p.z, 0.0));

    // Iterated fractal fold
    float t = 2.5 * fractalScale;
    for (int i = 0; i < 13; i++) {
        t *= 0.66;
        p.xy = mA * p.xy;
        p.yz = mB * p.yz;
        p.zx = mC * p.zx;
        p.xz = abs(p.xz) - t;
    }
    d = min(d, length(p) - 1.4 * t);
    return d;
}

vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}

vec3 raymarch(vec3 ro, vec3 rd) {
    vec3 p = ro;
    for (int i = 0; i < 20; i++) {
        p += rd * map(p);
    }
    return p;
}

void main() {
    vec2 pixel = v_texCoord * u_resolution;
    vec2 uv = pixel / u_resolution * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;

    // --- Compute dot-driven parameters ---

    // Average dot position in normalized space (-1 to 1)
    vec2 avgDotPos = vec2(0.0);
    float totalTrigger = 0.0;
    float dominantHue = 0.0;
    float maxTrigger = 0.0;
    int dotCount = min(u_numDots, 256);

    for (int i = 0; i < dotCount; i++) {
        vec2 dPos = u_dots[i].xy / u_resolution * 2.0 - 1.0;
        float trig = u_dotTrigger[i];
        avgDotPos += dPos * (0.5 + trig);
        totalTrigger += trig;
        if (trig > maxTrigger) {
            maxTrigger = trig;
            dominantHue = u_dots[i].w;
        }
    }
    if (dotCount > 0) {
        avgDotPos /= float(dotCount);
    }

    // Audio-reactive pulse
    float audioPulse = u_audioBass * 0.6 + u_audioMid * 0.3 + u_audioHigh * 0.1;

    // --- Build rotation matrices driven by dot motion + time ---
    // Base rotation from time, modulated by dot positions and audio
    float baseTime = u_time * u_fbSpeed;
    float dotInfluence = u_fbReactivity;

    float angleA = -0.001 * baseTime * 100.0
                 + avgDotPos.x * 0.5 * dotInfluence
                 + audioPulse * 0.3 * dotInfluence;

    float angleB = 0.0035 * baseTime * 100.0
                 + avgDotPos.y * 0.4 * dotInfluence
                 + u_audioBass * 0.5 * dotInfluence;

    float angleC = 0.0023 * baseTime * 100.0
                 + (avgDotPos.x + avgDotPos.y) * 0.3 * dotInfluence
                 + u_audioHigh * 0.4 * dotInfluence;

    mA = rot(angleA);
    mB = rot(angleB);
    mC = rot(angleC);

    // Fractal scale pulses with triggers and bass
    fractalScale = u_fbDepth + totalTrigger * 0.05 * dotInfluence
                 + audioPulse * 0.15 * dotInfluence;

    // --- Light follows dot activity ---
    // Light orbits but is pulled toward active dot positions
    float lightOrbit = baseTime * 0.1;
    vec3 baseLightPos = vec3(
        10.0 * sin(lightOrbit) + avgDotPos.x * 5.0 * dotInfluence,
        2.0 + avgDotPos.y * 3.0 * dotInfluence,
        -23.0 + audioPulse * 3.0
    );
    float lightRadius = 1.0 + totalTrigger * 0.3;
    lightPos = vec4(baseLightPos, lightRadius);

    // --- Camera ---
    float camZ = -15.0 + 2.0 * sin(baseTime * 0.1) + audioPulse * 2.0 * dotInfluence;
    vec3 ro = vec3(avgDotPos * 1.5 * dotInfluence, camZ / u_fbZoom);
    vec3 rd = normalize(vec3(uv, 5.0));

    // --- Raymarch ---
    vec3 hitPos = raymarch(ro, rd);
    vec3 normal = calcNormal(hitPos);
    vec3 toLight = normalize(lightPos.xyz - hitPos);

    // --- Coloring from dots ---
    // Base color shifts with dominant triggered dot hue
    vec3 baseCol;
    if (dotCount > 0 && maxTrigger > 0.01) {
        // Blend toward triggered dot's hue
        vec3 dotCol = hsv2rgb(vec3(dominantHue, 0.5 + maxTrigger * 0.3, 0.9));
        vec3 coolCol = vec3(0.7, 0.8, 0.9);
        baseCol = mix(coolCol, dotCol, maxTrigger * 0.7);
    } else {
        baseCol = vec3(0.7, 0.8, 0.9);
    }

    // Diffuse lighting
    float diff = max(dot(normal, toLight), 0.0);
    vec3 col = mix(baseCol, u_backgroundColor, diff * 0.8);

    // Shadow ray
    vec3 shadowHit = raymarch(hitPos + 0.01 * toLight, toLight);
    float inShadow = length(shadowHit - lightPos.xyz) > lightPos.w + 0.1 ? 1.0 : 0.0;
    col = mix(col, col * (1.0 - u_fbShadow * 0.8), inShadow);

    // --- Add trigger glow at fractal surface ---
    // Recent triggers create colored light blooms on the fractal
    for (int i = 0; i < min(u_numTriggerEvents, 64); i++) {
        vec2 ePos = u_triggerEvents[i].xy / u_resolution * 2.0 - 1.0;
        ePos.x *= u_resolution.x / u_resolution.y;
        float age = u_time - u_triggerEvents[i].w;
        if (age > 3.0) continue;

        float eHue = u_triggerEvents[i].z;
        // Project trigger position into 3D near the fractal
        vec3 trigLight = vec3(ePos * 8.0, -10.0);
        float trigDist = length(hitPos - trigLight);
        float trigGlow = exp(-trigDist * trigDist / (20.0 + age * 40.0)) * exp(-age * 1.5);
        col += hsv2rgb(vec3(eHue, 0.7, 1.0)) * trigGlow * 0.5 * u_fbBrightness;
    }

    // Blend with background
    float edgeFade = smoothstep(0.0, 0.3, map(hitPos));
    col = mix(col * u_fbBrightness, u_backgroundColor, edgeFade);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
