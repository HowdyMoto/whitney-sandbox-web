// @name: String Theory
// @simulation: false
// @param u_stringMaxDist:    float, "Connection Range",  default=0.23, min=0.05, max=0.6, rand_min=0.08, rand_max=0.5
// @param u_stringThickness:  float, "String Thickness",  default=1.6, min=0.5, max=8.0, rand_min=1.0, rand_max=6.0
// @param u_stringVibration:  float, "Vibration",         default=0.34, min=0.0, max=1.5, rand_min=0.1, rand_max=1.2
// @param u_stringBrightness: float, "Brightness",        default=0.4, min=0.05, max=1.0, rand_min=0.15, rand_max=0.8
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_backgroundColor;
uniform int   u_numDots;
uniform vec4  u_dots[256];
uniform vec2  u_dotVelocities[256];

// Tunable parameters
uniform float u_stringMaxDist;    // max connection distance (UV space)
uniform float u_stringThickness;  // line width in pixels
uniform float u_stringVibration;  // oscillation amplitude
uniform float u_stringBrightness; // overall glow intensity

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 pixel = v_texCoord * u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = v_texCoord;
    vec2 uvA = vec2(uv.x * aspect, uv.y);

    vec3 color = u_backgroundColor;
    float thickness = u_stringThickness / u_resolution.y;

    // For each pair of dots, draw a vibrating string between them
    for (int i = 0; i < u_numDots; i++) {
        vec2 posI = u_dots[i].xy / u_resolution;
        vec2 posIA = vec2(posI.x * aspect, posI.y);
        float hueI = u_dots[i].w;

        // Node glow at each dot position
        float dotDist = length(uvA - posIA);
        float nodeGlow = exp(-dotDist * dotDist / 0.0006) * u_stringBrightness * 0.4;
        color += hsv2rgb(vec3(hueI, 0.5, 1.0)) * nodeGlow;

        for (int j = i + 1; j < u_numDots; j++) {
            vec2 posJ = u_dots[j].xy / u_resolution;
            vec2 posJA = vec2(posJ.x * aspect, posJ.y);

            float pairDist = length(posIA - posJA);
            if (pairDist > u_stringMaxDist || pairDist < 0.001) continue;

            // Quick bounding box rejection: skip if pixel is far from the segment
            vec2 minB = min(posIA, posJA) - vec2(thickness * 8.0 + u_stringVibration * 0.03);
            vec2 maxB = max(posIA, posJA) + vec2(thickness * 8.0 + u_stringVibration * 0.03);
            if (uvA.x < minB.x || uvA.x > maxB.x || uvA.y < minB.y || uvA.y > maxB.y) continue;

            // Fade string as distance approaches max
            float distFade = 1.0 - smoothstep(u_stringMaxDist * 0.4, u_stringMaxDist, pairDist);

            // Project pixel onto line segment to get parameter t and perpendicular distance
            vec2 ab = posJA - posIA;
            float len2 = dot(ab, ab);
            float t = clamp(dot(uvA - posIA, ab) / len2, 0.0, 1.0);
            vec2 proj = posIA + t * ab;
            float perpDist = length(uvA - proj);

            // Vibration: standing wave perpendicular to the string
            float harmonic = float((i + j) % 5 + 1);
            float vibPhase = u_time * (1.2 + float(i ^ j) * 0.2);
            float standing = sin(3.14159 * harmonic * t + vibPhase);
            float envelope = sin(3.14159 * t); // zero at endpoints

            // Offset is applied to the perpendicular distance
            float vibOffset = standing * envelope * u_stringVibration * 0.015;
            float effectiveDist = abs(perpDist - abs(vibOffset));

            // Soft glow
            float stringGlow = exp(-effectiveDist * effectiveDist / (thickness * thickness * 3.0));
            // Bright core
            float core = smoothstep(thickness * 0.4, 0.0, effectiveDist);

            // Color: blend between the two dot hues along the string
            float hueJ = u_dots[j].w;
            float hueDiff = hueJ - hueI;
            if (hueDiff > 0.5) hueDiff -= 1.0;
            if (hueDiff < -0.5) hueDiff += 1.0;
            float hue = fract(hueI + hueDiff * t);

            float sat = 0.55 + 0.2 * abs(standing);
            vec3 stringColor = hsv2rgb(vec3(hue, sat, 1.0));

            float intensity = (stringGlow * 0.35 + core * 0.65) * distFade * u_stringBrightness;
            color += stringColor * intensity;
        }
    }

    // Vignette
    float vignette = 1.0 - pow(length(uv - 0.5) * 1.2, 2.5);
    color = mix(u_backgroundColor * 0.5, color, clamp(vignette, 0.0, 1.0));

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
