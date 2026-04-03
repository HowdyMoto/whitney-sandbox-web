// @name: Impulse
// @simulation: false
// @param u_impGlow:          float, "Glow",           default=1.0, min=0.0, max=3.0, rand_min=0.3, rand_max=2.5
// @param u_impOpacity:       float, "Fill Opacity",   default=0.5, min=0.0, max=1.0, rand_min=0.1, rand_max=0.8
// @param u_impOutline:       float, "Outline",        default=2.0, min=0.5, max=6.0, rand_min=1.0, rand_max=4.0
// @param u_impOutlineAlpha:  float, "Outline Opacity", default=0.8, min=0.0, max=1.0, rand_min=0.3, rand_max=1.0
// @param u_impDamping:       float, "Damping",        default=0.993, min=0.9, max=1.0, rand_min=0.985, rand_max=0.998, fmt="%.3f"
// @param u_impImpulseScale:  float, "Impulse Force",  default=1.0, min=0.1, max=5.0, rand_min=0.3, rand_max=3.0
// @param u_impImpulseRadius: float, "Impulse Radius", default=200.0, min=50.0, max=500.0, rand_min=80.0, rand_max=400.0, fmt="%.0f"
// @param u_impDotBounce:     float, "Dot Bounce",     default=0.85, min=0.0, max=1.0, rand_min=0.5, rand_max=1.0
// @param u_impBounce:        float, "Circle Bounce",  default=0.75, min=0.0, max=1.0, rand_min=0.4, rand_max=1.0
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2  u_resolution;
uniform float u_time;
uniform vec3  u_backgroundColor;
uniform int   u_numDots;
uniform vec4  u_dots[256];
uniform vec2  u_dotVelocities[256];

// Audio-reactive
uniform float u_audioAmplitude;

// Physics circles: vec4(x, y, radius, hue) in pixel coords
uniform int   u_numPhysCircles;
uniform vec4  u_physCircles[64];

// Tunable parameters
uniform float u_impGlow;        // glow intensity
uniform float u_impOpacity;     // circle fill opacity
uniform float u_impOutline;     // outline thickness (pixels)
uniform float u_impOutlineAlpha; // outline opacity

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = v_texCoord;
    vec2 pixel = uv * u_resolution;

    vec3 color = u_backgroundColor;

    // Accumulate from all physics circles
    for (int i = 0; i < u_numPhysCircles; i++) {
        vec2 cPos = u_physCircles[i].xy;
        float cRad = u_physCircles[i].z;
        float cHue = u_physCircles[i].w;

        float dist = length(pixel - cPos);
        vec3 cColor = hsv2rgb(vec3(cHue, 0.65, 0.95));

        // Filled circle interior (semi-transparent)
        if (dist < cRad) {
            float edgeSoft = smoothstep(cRad, cRad - 2.0, dist);
            // Radial gradient: brighter at center
            float grad = 1.0 - dist / cRad;
            float alpha = edgeSoft * u_impOpacity * (0.3 + grad * 0.7);
            color = mix(color, cColor, alpha);
        }

        // Outline ring
        float ringDist = abs(dist - cRad);
        float ring = smoothstep(u_impOutline, 0.0, ringDist);
        color = mix(color, cColor * 1.2, ring * u_impOutlineAlpha);

        // Outer glow
        if (dist > cRad && u_impGlow > 0.0) {
            float glowFalloff = exp(-(dist - cRad) * (dist - cRad) / (cRad * cRad * u_impGlow * 0.3));
            color += cColor * glowFalloff * u_impGlow * 0.15;
        }
    }

    // Amplitude-driven background pulse
    color += u_backgroundColor * u_audioAmplitude * 0.1;

    // Vignette
    float vignette = 1.0 - pow(length(uv - 0.5) * 1.2, 3.0);
    color *= clamp(vignette, 0.3, 1.0);

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
