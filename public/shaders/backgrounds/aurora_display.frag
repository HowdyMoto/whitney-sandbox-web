// Display pass for Aurora
// @param u_auroraSaturation: float, "Saturation", default=0.7, min=0.0, max=1.5, rand_min=0.3, rand_max=1.0
// @param u_auroraGlow:       float, "Glow",       default=1.2, min=0.3, max=3.0, rand_min=0.5, rand_max=2.0
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_simState;
uniform vec3  u_backgroundColor;
uniform vec2  u_resolution;
uniform float u_time;

uniform float u_auroraSaturation;
uniform float u_auroraGlow;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec4 state = texture(u_simState, v_fbUV).rgba;
    float energy = state.r;
    float hue = state.g;

    vec3 color = u_backgroundColor;

    if (energy > 0.005) {
        // Procedural vertical ray structure — shimmer that doesn't depend on simulation
        float x = v_texCoord.x * u_resolution.x;
        float rayPhase = x * 0.02 + u_time * 0.3;
        float rays = 0.6 + 0.4 * sin(rayPhase) * sin(rayPhase * 0.7 + 1.3);

        // Vertical fade: brighter at top
        float yFade = 1.0 - v_texCoord.y;
        yFade = yFade * yFade; // quadratic falloff toward bottom

        float brightness = energy * rays * yFade * u_auroraGlow;

        vec3 auroraColor = hsv2rgb(vec3(hue, u_auroraSaturation, min(brightness, 1.0)));
        color += auroraColor * brightness;
    }

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
