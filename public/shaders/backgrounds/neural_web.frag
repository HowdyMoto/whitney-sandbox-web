// @name: Neural Web
// @simulation: false
// @param u_nwConnRange:    float, "Connection Range",   default=0.25, min=0.08, max=0.5,  rand_min=0.12, rand_max=0.45
// @param u_nwLineThick:    float, "Line Thickness",     default=1.2,  min=0.5,  max=4.0,  rand_min=0.6,  rand_max=3.0
// @param u_nwPulseSpeed:   float, "Pulse Speed",        default=1.5,  min=0.5,  max=3.0,  rand_min=0.7,  rand_max=2.5
// @param u_nwNodeGlow:     float, "Node Glow",          default=0.8,  min=0.2,  max=2.0,  rand_min=0.3,  rand_max=1.8
// @param u_nwBrightness:   float, "Brightness",         default=0.5,  min=0.1,  max=1.0,  rand_min=0.15, rand_max=0.85
// @param u_nwReactivity:   float, "Music Reactivity",   default=0.8,  min=0.0,  max=1.5,  rand_min=0.2,  rand_max=1.3
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_backgroundColor;
uniform int   u_numDots;
uniform vec4  u_dots[256];          // .xy = pixel pos, .z = orbit radius, .w = hue
uniform vec2  u_dotVelocities[256]; // px/sec
uniform float u_dotNotes[256];      // normalized pitch 0-1
uniform float u_dotTrigger[256];    // trigger state 0-1
uniform int   u_numTriggerEvents;
uniform vec4  u_triggerEvents[64];  // .xy = pixel pos, .z = hue, .w = birth time
uniform float u_audioAmplitude;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_eqBands[32];

// Custom parameters
uniform float u_nwConnRange;
uniform float u_nwLineThick;
uniform float u_nwPulseSpeed;
uniform float u_nwNodeGlow;
uniform float u_nwBrightness;
uniform float u_nwReactivity;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = v_texCoord;
    vec2 uvA = vec2(uv.x * aspect, uv.y);  // aspect-corrected

    vec3 color = u_backgroundColor;
    float thickness = u_nwLineThick / u_resolution.y;
    int maxDots = min(u_numDots, 32);

    // ---------------------------------------------------------------
    // STEP 1 — Node rendering
    // ---------------------------------------------------------------
    for (int i = 0; i < u_numDots; i++) {
        vec2 posUV = u_dots[i].xy / u_resolution;
        vec2 posA = vec2(posUV.x * aspect, posUV.y);
        float hue = u_dots[i].w;
        float trig = u_dotTrigger[i];

        vec2 delta = uvA - posA;
        float dx = abs(delta.x);
        float dy = abs(delta.y);

        // Rounded-square distance: mix between Chebyshev and Euclidean
        float chebyshev = max(dx, dy);
        float euclidean = length(delta);
        float nodeDist = mix(euclidean, chebyshev, 0.35);

        // Node glow size, expands on trigger
        float glowSize = u_nwNodeGlow * 0.012 * (1.0 + trig * u_nwReactivity * 1.5);

        // Soft outer glow
        float outerGlow = exp(-nodeDist * nodeDist / (glowSize * glowSize));
        // Bright core
        float coreSize = glowSize * 0.25;
        float core = exp(-nodeDist * nodeDist / (coreSize * coreSize));

        float nodeIntensity = (outerGlow * 0.4 + core * 0.8) * u_nwBrightness;

        // Triggered dots pulse brighter
        float triggerBoost = 1.0 + trig * u_nwReactivity * 2.0;
        nodeIntensity *= triggerBoost;

        // Node color: warm, saturated
        float sat = 0.6 + 0.2 * trig;
        vec3 nodeColor = hsv2rgb(vec3(hue, sat, 1.0));
        color += nodeColor * nodeIntensity;

        // Expanding ring on trigger
        if (trig > 0.01) {
            float ringRadius = (1.0 - trig) * 0.06 * u_nwNodeGlow;
            float ringDist = abs(nodeDist - ringRadius);
            float ring = exp(-ringDist * ringDist / (thickness * thickness * 2.0));
            ring *= trig * u_nwReactivity * u_nwBrightness * 0.5;
            color += nodeColor * ring;
        }
    }

    // ---------------------------------------------------------------
    // STEP 2 — Connection rendering (capped to first 32 dots)
    // ---------------------------------------------------------------
    for (int i = 0; i < maxDots; i++) {
        vec2 posI = u_dots[i].xy / u_resolution;
        vec2 posIA = vec2(posI.x * aspect, posI.y);
        float hueI = u_dots[i].w;
        float noteI = u_dotNotes[i];
        float trigI = u_dotTrigger[i];

        for (int j = i + 1; j < maxDots; j++) {
            vec2 posJ = u_dots[j].xy / u_resolution;
            vec2 posJA = vec2(posJ.x * aspect, posJ.y);

            // Distance between dots
            float pairDist = length(posIA - posJA);
            if (pairDist > u_nwConnRange || pairDist < 0.001) continue;

            // Bounding box rejection
            float margin = thickness * 6.0;
            vec2 minB = min(posIA, posJA) - vec2(margin);
            vec2 maxB = max(posIA, posJA) + vec2(margin);
            if (uvA.x < minB.x || uvA.x > maxB.x || uvA.y < minB.y || uvA.y > maxB.y) continue;

            // Project pixel onto line segment
            vec2 ab = posJA - posIA;
            float len2 = dot(ab, ab);
            float t = clamp(dot(uvA - posIA, ab) / len2, 0.0, 1.0);
            vec2 proj = posIA + t * ab;
            float perpDist = length(uvA - proj);

            // (a) Thin glowing line — Gaussian falloff
            float lineGlow = exp(-perpDist * perpDist / (thickness * thickness * 1.5));

            // (b) Distance fade — connections fade near max range
            float distFade = 1.0 - smoothstep(u_nwConnRange * 0.5, u_nwConnRange, pairDist);

            // (c) Energy pulses along connections
            float trigJ = u_dotTrigger[j];
            float pulseContrib = 0.0;

            // Pulse from dot i toward dot j
            if (trigI > 0.01) {
                float phase = (1.0 - trigI) * u_nwPulseSpeed;
                float pulseWidth = 0.12;
                pulseContrib += exp(-(t - phase) * (t - phase) / (pulseWidth * pulseWidth))
                              * trigI * u_nwReactivity;
            }
            // Pulse from dot j toward dot i (travels in reverse: use 1-t)
            if (trigJ > 0.01) {
                float phase = (1.0 - trigJ) * u_nwPulseSpeed;
                float pulseWidth = 0.12;
                pulseContrib += exp(-((1.0 - t) - phase) * ((1.0 - t) - phase) / (pulseWidth * pulseWidth))
                              * trigJ * u_nwReactivity;
            }

            // (d) Harmonic relationship brightness
            float noteJ = u_dotNotes[j];
            float interval = abs(noteI - noteJ);
            float harmonicBrightness = 1.0 / (1.0 + fract(interval * 12.0) * 3.0);

            // (e) Color: blend between the two dot hues along the segment
            float hueJ = u_dots[j].w;
            float hueDiff = hueJ - hueI;
            if (hueDiff > 0.5) hueDiff -= 1.0;
            if (hueDiff < -0.5) hueDiff += 1.0;
            float hue = fract(hueI + hueDiff * t);

            float sat = 0.5 + 0.25 * harmonicBrightness;
            vec3 connColor = hsv2rgb(vec3(hue, sat, 1.0));

            // Combine: base line glow + energy pulse brightening
            float baseIntensity = lineGlow * distFade * harmonicBrightness * u_nwBrightness * 0.35;
            float pulseIntensity = lineGlow * pulseContrib * distFade * u_nwBrightness * 1.2;

            // Pulse makes the line thicker (wider Gaussian) for a "traveling flash" feel
            float pulseThicken = exp(-perpDist * perpDist / (thickness * thickness * 6.0))
                               * pulseContrib * distFade * u_nwBrightness * 0.6;

            color += connColor * (baseIntensity + pulseIntensity + pulseThicken);
        }
    }

    // ---------------------------------------------------------------
    // STEP 3 — Trigger event ripples
    // ---------------------------------------------------------------
    for (int i = 0; i < u_numTriggerEvents; i++) {
        vec2 evPos = u_triggerEvents[i].xy / u_resolution;
        vec2 evPosA = vec2(evPos.x * aspect, evPos.y);
        float evHue = u_triggerEvents[i].z;
        float evBirth = u_triggerEvents[i].w;

        float age = u_time - evBirth;
        if (age < 0.0 || age > 2.0) continue;

        float fade = exp(-age * 2.5);
        float ringRadius = age * 0.12;

        vec2 dv = uvA - evPosA;
        float dist = length(dv);
        float ringDist = abs(dist - ringRadius);

        // Crystalline/angular feel: modulate ring thickness by angle
        float angle = atan(dv.y, dv.x);
        float angular = 1.0 + 0.3 * cos(angle * 6.0);  // hexagonal modulation

        float ringThick = thickness * 2.0 * angular;
        float ring = exp(-ringDist * ringDist / (ringThick * ringThick)) * fade;

        vec3 ringColor = hsv2rgb(vec3(evHue, 0.5, 1.0));
        color += ringColor * ring * u_nwBrightness * u_nwReactivity * 0.5;
    }

    // ---------------------------------------------------------------
    // Vignette
    // ---------------------------------------------------------------
    float vignette = 1.0 - pow(length(uv - 0.5) * 1.2, 2.5);
    color = mix(u_backgroundColor * 0.5, color, clamp(vignette, 0.0, 1.0));

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
