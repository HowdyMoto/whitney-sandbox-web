// @name: Navier-Stokes Fluid
// @simulation: true
// @simsteps: 2
// @param u_fluidForce:       float, "Force",         default=8.0,  min=0.5, max=25.0, rand_min=3.0, rand_max=15.0
// @param u_fluidRadius:      float, "Force Radius",  default=0.045, min=0.01, max=0.1, rand_min=0.02, rand_max=0.07
// @param u_fluidDissipation: float, "Vel. Damping",  default=0.992, min=0.96, max=0.999, rand_min=0.98, rand_max=0.998, fmt="%.3f"
// @param u_fluidDyeFade:     float, "Dye Fade",      default=0.996, min=0.97, max=0.9999, rand_min=0.99, rand_max=0.999, fmt="%.4f"
// @param u_fluidDyeStrength: float, "Dye Intensity", default=1.0,  min=0.1, max=3.0, rand_min=0.4, rand_max=2.0
// @param u_fluidCurl:        float, "Curl",          default=40.0, min=0.0, max=80.0, rand_min=15.0, rand_max=60.0, fmt="%.0f"
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform sampler2D u_prevState;
uniform vec2      u_texelSize;

// Dots: velocity forces (all dots push fluid)
uniform int       u_numDots;
uniform vec4      u_dots[256];
uniform vec2      u_dotVelocities[256];

// Trigger events: dye injection (only at note triggers)
uniform int       u_numTriggerEvents;
uniform vec4      u_triggerEvents[64];   // xy=pos, z=hue, w=birthTime

uniform float u_fluidForce;
uniform float u_fluidRadius;
uniform float u_fluidDissipation;
uniform float u_fluidDyeFade;
uniform float u_fluidDyeStrength;
uniform float u_fluidCurl;

// State: R=vel.x, G=vel.y, B=dye amount, A=dye hue

void main() {
    vec2 uv = v_texCoord;
    vec2 dx = vec2(u_texelSize.x, 0.0);
    vec2 dy = vec2(0.0, u_texelSize.y);

    // ─── Neighbor samples ─────────────────────────────────────
    vec4 cC = texture(u_prevState, uv);
    vec4 cL = texture(u_prevState, uv - dx);
    vec4 cR = texture(u_prevState, uv + dx);
    vec4 cB = texture(u_prevState, uv - dy);
    vec4 cT = texture(u_prevState, uv + dy);

    // ─── Self-advection ───────────────────────────────────────
    vec2 vel = cC.rg;
    vec2 coord = uv - vel * u_texelSize;
    coord = clamp(coord, u_texelSize, 1.0 - u_texelSize);
    vec4 advected = texture(u_prevState, coord);

    vel = advected.rg * u_fluidDissipation;
    float dye = advected.b * u_fluidDyeFade;
    float hue = advected.a;

    // ─── Pressure projection ──────────────────────────────────
    float div = 0.5 * ((cR.r - cL.r) + (cT.g - cB.g));
    vel -= vec2(cR.r - cL.r, cT.g - cB.g) * 0.35;
    // Viscous diffusion
    vel += ((cL.rg + cR.rg + cB.rg + cT.rg) * 0.25 - cC.rg) * 0.18;

    // ─── Vorticity confinement ────────────────────────────────
    float curl = 0.5 * ((cR.g - cL.g) - (cT.r - cB.r));

    vec4 cLL = texture(u_prevState, uv - dx * 2.0);
    vec4 cRR = texture(u_prevState, uv + dx * 2.0);
    vec4 cBB = texture(u_prevState, uv - dy * 2.0);
    vec4 cTT = texture(u_prevState, uv + dy * 2.0);

    float curlR = abs(0.5 * ((cRR.g - cC.g) - (texture(u_prevState, uv + dx + dy).r - texture(u_prevState, uv + dx - dy).r)));
    float curlL = abs(0.5 * ((cC.g - cLL.g) - (texture(u_prevState, uv - dx + dy).r - texture(u_prevState, uv - dx - dy).r)));
    float curlT = abs(0.5 * ((texture(u_prevState, uv + dy + dx).g - texture(u_prevState, uv + dy - dx).g) - (cTT.r - cC.r)));
    float curlB2 = abs(0.5 * ((texture(u_prevState, uv - dy + dx).g - texture(u_prevState, uv - dy - dx).g) - (cC.r - cBB.r)));

    vec2 eta = vec2(curlR - curlL, curlT - curlB2);
    float etaLen = length(eta);
    if (etaLen > 1e-5) {
        vel += normalize(eta) * curl * u_fluidCurl * u_texelSize.x;
    }

    // ─── Velocity forces from ALL dots ────────────────────────
    // Dots push the fluid but DON'T inject dye
    float aspect = u_resolution.x / u_resolution.y;
    float r2 = u_fluidRadius * u_fluidRadius;

    for (int i = 0; i < u_numDots; i++) {
        vec2 dotUV = u_dots[i].xy / u_resolution;
        vec2 dotVel = u_dotVelocities[i] / u_resolution;

        if (length(dotVel) < 0.00001) continue;

        vec2 diff = uv - dotUV;
        diff.x *= aspect;
        float d2 = dot(diff, diff);
        float splat = exp(-d2 / r2);
        if (splat < 0.001) continue;

        vel += dotVel * splat * u_fluidForce;
    }

    // ─── Dye injection ONLY from trigger events ───────────────
    // This is the key difference: dye appears as brief splats at
    // note trigger positions, then gets carried by the fluid.
    float dyeR2 = u_fluidRadius * u_fluidRadius * 0.5; // tighter splat for dye

    for (int i = 0; i < u_numTriggerEvents; i++) {
        vec2 eventPos = u_triggerEvents[i].xy / u_resolution;
        float eventHue = u_triggerEvents[i].z;
        float age = u_time - u_triggerEvents[i].w;

        // Only inject dye for fresh events (< 0.15 seconds old)
        if (age > 0.15 || age < 0.0) continue;

        float freshness = 1.0 - age / 0.15;

        vec2 diff = uv - eventPos;
        diff.x *= aspect;
        float d2 = dot(diff, diff);
        float splat = exp(-d2 / dyeR2) * freshness;

        if (splat < 0.001) continue;

        float inject = splat * u_fluidDyeStrength;
        dye += inject;
        hue = mix(hue, eventHue, min(inject * 0.8, 0.5));
    }

    // ─── Clamp + boundary ─────────────────────────────────────
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    vel *= smoothstep(0.0, 0.03, edge);
    dye = clamp(dye, 0.0, 1.0);

    float speed = length(vel);
    if (speed > 0.4) vel *= 0.4 / speed;

    fragColor = vec4(vel, dye, hue);
}
