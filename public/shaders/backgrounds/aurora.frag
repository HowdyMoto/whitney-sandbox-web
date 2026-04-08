// @name: Aurora
// @simulation: true
// @simsteps: 1
// @param u_auroraBrightness: float, "Brightness",    default=0.8,  min=0.1, max=2.0, rand_min=0.3, rand_max=1.2
// @param u_auroraDecay:      float, "Persistence",   default=0.98, min=0.93, max=0.998, rand_min=0.96, rand_max=0.995, fmt="%.3f"
// @param u_auroraSpread:     float, "Vertical Spread", default=0.4, min=0.1, max=1.0, rand_min=0.2, rand_max=0.8
// @param u_auroraDrift:      float, "Drift Speed",   default=0.3,  min=0.0, max=1.0, rand_min=0.1, rand_max=0.6
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform sampler2D u_prevState;
uniform vec2      u_texelSize;

uniform int       u_numDots;
uniform vec4      u_dots[256];
uniform float     u_dotTrigger[256];

uniform int       u_numTriggerEvents;
uniform vec4      u_triggerEvents[64];

uniform float u_auroraBrightness;
uniform float u_auroraDecay;
uniform float u_auroraSpread;
uniform float u_auroraDrift;

// State: R = energy, G = hue, B = unused, A = 1

void main() {
    vec2 uv = v_texCoord;
    vec2 pixel = uv * u_resolution;

    // Drift: read from a horizontally shifted position (slow sideways movement)
    float drift = u_auroraDrift * u_texelSize.x * 30.0;
    vec2 driftUV = uv + vec2(drift, 0.0);

    // Slight vertical diffusion (aurora shimmers vertically)
    vec2 dy = vec2(0.0, u_texelSize.y);
    float prevC = texture(u_prevState, driftUV).r;
    float prevU = texture(u_prevState, driftUV + dy).r;
    float prevD = texture(u_prevState, driftUV - dy).r;

    // Minimal horizontal diffusion
    vec2 dx = vec2(u_texelSize.x, 0.0);
    float prevL = texture(u_prevState, driftUV - dx).r;
    float prevR = texture(u_prevState, driftUV + dx).r;

    // Vertical bias: spread upward more than downward
    float energy = prevC * 0.6 + prevU * 0.18 + prevD * 0.08 + prevL * 0.07 + prevR * 0.07;

    // Decay
    energy *= u_auroraDecay;

    // Read previous hue (carried via advection, not diffused)
    float hue = texture(u_prevState, driftUV).g;

    // Deposit energy from trigger events as vertical columns
    for (int i = 0; i < u_numTriggerEvents; i++) {
        vec2 pos = u_triggerEvents[i].xy;
        float trigHue = u_triggerEvents[i].z;
        float age = u_time - u_triggerEvents[i].w;
        if (age > 0.25) continue;

        // Column: narrow in x, tall in y
        float dx2 = (pixel.x - pos.x);
        float columnWidth = u_resolution.x * 0.025;
        float xFalloff = exp(-(dx2 * dx2) / (columnWidth * columnWidth));

        // Vertical: energy concentrated in upper portion, fading downward
        float yNorm = 1.0 - uv.y; // 0 at top, 1 at bottom
        float verticalEnvelope = exp(-yNorm * yNorm / (u_auroraSpread * u_auroraSpread));

        float deposit = xFalloff * verticalEnvelope * u_auroraBrightness * (1.0 - age / 0.25);
        energy = min(energy + deposit * 0.3, 1.5);

        if (deposit > 0.05) {
            hue = mix(hue, trigHue, deposit * 0.4);
        }
    }

    // Also deposit from dots with active trigger animation
    for (int i = 0; i < u_numDots; i++) {
        float trig = u_dotTrigger[i];
        if (trig < 0.02) continue;

        vec2 dotPos = u_dots[i].xy;
        float dotHue = u_dots[i].w;

        float dx2 = (pixel.x - dotPos.x);
        float columnWidth = u_resolution.x * 0.02;
        float xFalloff = exp(-(dx2 * dx2) / (columnWidth * columnWidth));

        float yNorm = 1.0 - uv.y;
        float verticalEnvelope = exp(-yNorm * yNorm / (u_auroraSpread * u_auroraSpread));

        float deposit = xFalloff * verticalEnvelope * trig * u_auroraBrightness;
        energy = min(energy + deposit * 0.15, 1.5);

        if (deposit > 0.03) {
            hue = mix(hue, dotHue, deposit * 0.3);
        }
    }

    fragColor = vec4(clamp(energy, 0.0, 1.5), hue, 0.0, 1.0);
}
