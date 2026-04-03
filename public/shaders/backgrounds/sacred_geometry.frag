// @name: Sacred Geometry
// @simulation: false
// @param u_sgBrightness:  float, "Brightness",       default=0.5,  min=0.1, max=1.0,  rand_min=0.2, rand_max=0.8
// @param u_sgReactivity:  float, "Music Reactivity", default=0.8,  min=0.0, max=1.5,  rand_min=0.2, rand_max=1.2
// @param u_sgLineWidth:   float, "Line Width",       default=1.5,  min=0.5, max=4.0,  rand_min=0.7, rand_max=3.0
// @param u_sgGlow:        float, "Glow",             default=1.0,  min=0.2, max=3.0,  rand_min=0.4, rand_max=2.0
// @param u_sgConnections: float, "Connections",      default=0.6,  min=0.0, max=1.0,  rand_min=0.2, rand_max=0.9
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

uniform float u_sgBrightness;
uniform float u_sgReactivity;
uniform float u_sgLineWidth;
uniform float u_sgGlow;
uniform float u_sgConnections;

const float PI  = 3.14159265;
const float TAU = 6.28318530;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = v_texCoord;
    vec2 pixel = uv * u_resolution;
    vec2 center = u_resolution * 0.5;

    vec3 color = u_backgroundColor;

    float lineW = u_sgLineWidth;
    float lineW2 = lineW * lineW;
    float glowW = lineW * u_sgGlow * 3.0;
    float glowW2 = glowW * glowW;

    int nd = min(u_numDots, 64);

    // === Layer 1: Orbit circles ===
    // Each dot's distance from screen center defines a circle.
    // These overlapping circles form Flower-of-Life-like intersections.
    for (int i = 0; i < nd; i++) {
        vec2 dotPos = u_dots[i].xy;
        float hue = u_dots[i].w;
        float trig = u_dotTrigger[i];

        // Orbit radius = dot's distance from screen center
        float orbitR = length(dotPos - center);

        // Distance from this pixel to the orbit circle
        float pixelR = length(pixel - center);
        float circleD = abs(pixelR - orbitR);

        // Line brightness — base dim, brightens on trigger
        float baseBright = 0.15 + trig * u_sgReactivity * 1.5;

        float line = exp(-circleD * circleD / lineW2) * baseBright;
        float glow = exp(-circleD * circleD / glowW2) * baseBright * 0.2;

        vec3 circleColor = hsv2rgb(vec3(hue, 0.5 + trig * 0.3, 1.0));
        color += circleColor * (line + glow) * u_sgBrightness;
    }

    // === Layer 2: Dot nodes — glowing points with mandala rings ===
    for (int i = 0; i < nd; i++) {
        vec2 dotPos = u_dots[i].xy;
        float hue = u_dots[i].w;
        float trig = u_dotTrigger[i];
        float note = u_dotNotes[i];

        vec2 diff = pixel - dotPos;
        float dist2 = dot(diff, diff);

        // Node glow
        float nodeSize = 8.0 + trig * 20.0;
        float nodeGlow = exp(-dist2 / (nodeSize * nodeSize)) * (0.4 + trig * u_sgReactivity * 2.0);

        // Small mandala ring around each dot — radius based on pitch
        float mandalaR = 15.0 + note * 30.0;
        float dist = sqrt(dist2);
        float ringD = abs(dist - mandalaR);
        float ring = exp(-ringD * ringD / lineW2) * (0.1 + trig * u_sgReactivity * 0.8);

        // Second harmonic ring
        float ring2D = abs(dist - mandalaR * 0.5);
        float ring2 = exp(-ring2D * ring2D / lineW2) * (0.05 + trig * u_sgReactivity * 0.4);

        vec3 nodeColor = hsv2rgb(vec3(hue, 0.6 - trig * 0.3, 1.0));
        color += nodeColor * (nodeGlow + ring + ring2) * u_sgBrightness;
    }

    // === Layer 3: Sacred connections between dots ===
    // Lines connecting dots — the web that forms Metatron's Cube-like patterns.
    // Only draw connections when dots are close enough or triggered.
    int maxConn = min(nd, 24);
    for (int i = 0; i < maxConn; i++) {
        vec2 posI = u_dots[i].xy;
        float hueI = u_dots[i].w;
        float trigI = u_dotTrigger[i];
        float noteI = u_dotNotes[i];

        for (int j = i + 1; j < maxConn; j++) {
            vec2 posJ = u_dots[j].xy;
            float pairDist = length(posI - posJ);

            // Connection range scales with the connection slider
            float maxRange = u_resolution.y * (0.2 + u_sgConnections * 0.5);
            if (pairDist > maxRange || pairDist < 5.0) continue;

            float trigJ = u_dotTrigger[j];
            float trigMax = max(trigI, trigJ);

            // Harmonic relationship — octaves and fifths glow brighter
            float noteJ = u_dotNotes[j];
            float interval = abs(noteI - noteJ);
            float harmonic = 1.0 / (1.0 + fract(interval * 12.0) * 4.0);

            // Visibility: base level + much brighter on trigger
            float vis = (0.05 + harmonic * 0.1) * u_sgConnections
                      + trigMax * u_sgReactivity * 0.6;
            if (vis < 0.02) continue;

            // Bounding box check
            float margin = glowW * 2.0;
            vec2 mn = min(posI, posJ) - vec2(margin);
            vec2 mx = max(posI, posJ) + vec2(margin);
            if (pixel.x < mn.x || pixel.x > mx.x || pixel.y < mn.y || pixel.y > mx.y) continue;

            // Distance to line segment
            vec2 ab = posJ - posI;
            float len2 = dot(ab, ab);
            float t = clamp(dot(pixel - posI, ab) / len2, 0.0, 1.0);
            vec2 proj = posI + t * ab;
            float perpDist = length(pixel - proj);

            float connLine = exp(-perpDist * perpDist / lineW2) * vis;
            float connGlow = exp(-perpDist * perpDist / glowW2) * vis * 0.25;

            // Distance fade
            float distFade = 1.0 - smoothstep(maxRange * 0.5, maxRange, pairDist);
            connLine *= distFade;
            connGlow *= distFade;

            // Color blends between the two dots along the segment
            float hueDiff = u_dots[j].w - hueI;
            if (hueDiff > 0.5) hueDiff -= 1.0;
            if (hueDiff < -0.5) hueDiff += 1.0;
            float hue = fract(hueI + hueDiff * t);

            vec3 connColor = hsv2rgb(vec3(hue, 0.5 + harmonic * 0.3, 1.0));
            color += connColor * (connLine + connGlow) * u_sgBrightness;

            // Midpoint jewel — intersection node glows at line midpoints
            vec2 mid = (posI + posJ) * 0.5;
            float midDist = length(pixel - mid);
            float jewel = exp(-midDist * midDist / (lineW2 * 4.0)) * vis * harmonic * 0.5;
            color += connColor * jewel * u_sgBrightness;
        }
    }

    // === Layer 4: Intersection halos ===
    // Where orbit circles cross, draw bright intersection markers.
    // Check pairs of dots — their orbits intersect when the circles overlap.
    float pixelR = length(pixel - center);
    float pixelAngle = atan(pixel.y - center.y, pixel.x - center.x);

    for (int i = 0; i < min(nd, 20); i++) {
        float orbitI = length(u_dots[i].xy - center);
        float trigI = u_dotTrigger[i];

        // How close is this pixel to orbit i?
        float dI = abs(pixelR - orbitI);
        if (dI > glowW * 2.0) continue;

        for (int j = i + 1; j < min(nd, 20); j++) {
            float orbitJ = length(u_dots[j].xy - center);
            float trigJ = u_dotTrigger[j];

            float dJ = abs(pixelR - orbitJ);
            if (dJ > glowW * 2.0) continue;

            // This pixel is near BOTH orbit circles — it's at an intersection
            float intersection = exp(-dI * dI / lineW2) * exp(-dJ * dJ / lineW2);
            float trigBoth = max(trigI, trigJ);
            intersection *= 0.3 + trigBoth * u_sgReactivity * 2.0;

            float hue = (u_dots[i].w + u_dots[j].w) * 0.5;
            vec3 intColor = hsv2rgb(vec3(hue, 0.4, 1.0));
            color += intColor * intersection * u_sgBrightness * 2.0;
        }
    }

    // === Layer 5: Trigger event ripples — expanding sacred polygons ===
    for (int i = 0; i < u_numTriggerEvents; i++) {
        vec2 evPos = u_triggerEvents[i].xy;
        float evHue = u_triggerEvents[i].z;
        float age = u_time - u_triggerEvents[i].w;
        if (age < 0.0 || age > 2.5) continue;

        float fade = exp(-age * 2.0);
        vec2 ep = pixel - evPos;
        float dist = length(ep);

        // Expanding hexagonal ring
        float expandR = age * 200.0;
        float ringD = abs(dist - expandR);
        float ring = exp(-ringD * ringD / lineW2) * fade;

        // Hexagonal shape modulation
        float a = atan(ep.y, ep.x);
        float hex = cos(PI / 6.0) / cos(mod(a + PI / 6.0, PI / 3.0) - PI / 6.0);
        float hexD = abs(dist - expandR * hex);
        float hexRing = exp(-hexD * hexD / lineW2) * fade * 0.8;

        // Radial spokes from the trigger point
        float spokeAngle = mod(a, PI / 3.0) - PI / 6.0;
        float spoke = exp(-spokeAngle * spokeAngle * 200.0) * fade;
        spoke *= smoothstep(expandR * 1.1, expandR * 0.2, dist); // only inside the ring

        vec3 evColor = hsv2rgb(vec3(evHue, 0.5, 1.0));
        color += evColor * (ring + hexRing + spoke * 0.3) * u_sgReactivity * u_sgBrightness;
    }

    // === Center of gravity glow ===
    float centerGlow = exp(-dot(pixel - center, pixel - center) / (2000.0 * u_sgGlow));
    centerGlow *= u_sgBrightness * 0.08 * (1.0 + u_audioBass * u_sgReactivity);
    color += vec3(1.0, 0.95, 0.9) * centerGlow;

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
