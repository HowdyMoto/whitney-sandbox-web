// Display pass for Navier-Stokes Fluid — renders dye field as colored wisps
// @param u_fluidSaturation: float, "Saturation",  default=0.85, min=0.0, max=1.5, rand_min=0.4, rand_max=1.2
// @param u_fluidBrightness: float, "Brightness",  default=1.2, min=0.2, max=3.0, rand_min=0.5, rand_max=2.0
// @param u_fluidVelVis:     float, "Vel. Glow",   default=0.15, min=0.0, max=1.0, rand_min=0.0, rand_max=0.4
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_simState;
uniform vec3  u_backgroundColor;
uniform vec2  u_resolution;

uniform float u_fluidSaturation;
uniform float u_fluidBrightness;
uniform float u_fluidVelVis;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec4 state = texture(u_simState, v_texCoord);
    vec2 vel = state.rg;
    float dye = state.b;
    float hue = state.a;

    // Start from background
    vec3 color = u_backgroundColor;

    // Dye visualization: thin colored wisps
    if (dye > 0.001) {
        vec3 dyeColor = hsv2rgb(vec3(hue, u_fluidSaturation, 1.0));
        // Dye blends over background based on its amount
        float alpha = dye * u_fluidBrightness;
        color = mix(color, dyeColor * u_fluidBrightness, min(alpha, 1.0));
    }

    // Subtle velocity visualization — faint highlight in fast-moving areas
    float speed = length(vel);
    if (u_fluidVelVis > 0.0 && speed > 0.01) {
        float velGlow = smoothstep(0.01, 0.2, speed) * u_fluidVelVis;
        color += vec3(0.05, 0.08, 0.15) * velGlow;
    }

    fragColor = vec4(color, 1.0);
}
