// @name: Equalizer
// @simulation: true
// @simsteps: 1
// @param u_eqNumBars:     int,   "Bands",             default=8,    min=2,   max=32,   rand_min=4,   rand_max=16
// @param u_eqScrollSpeed: float, "Scroll Speed",      default=1.0,  min=0.2, max=3.0,  rand_min=0.4, rand_max=2.0
// @param u_eqDecay:       float, "Trail Persistence", default=0.99, min=0.9, max=0.999,rand_min=0.97,rand_max=0.998, fmt="%.3f"
// @param u_eqSmoothing:   float, "Smoothing",          default=0.8,  min=0.0, max=0.95, rand_min=0.5, rand_max=0.9, fmt="%.2f"
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform sampler2D u_prevState;
uniform vec2      u_texelSize;

uniform float u_eqBands[32];

uniform int   u_eqNumBars;
uniform float u_eqScrollSpeed;
uniform float u_eqDecay;
uniform float u_eqSmoothing;

void main() {
    vec2 uv = v_texCoord;

    // Scroll: shift everything down, write new data at top
    float scrollStep = u_texelSize.y * u_eqScrollSpeed * 3.0;
    vec2 srcUV = vec2(uv.x, uv.y - scrollStep);

    if (srcUV.y < 0.0) {
        // New data row — aggregate EQ bins into bands
        int numBars = clamp(u_eqNumBars, 2, 32);
        int bandIdx = clamp(int(uv.x * float(numBars)), 0, numBars - 1);

        float binsPerBar = 32.0 / float(numBars);
        int binStart = int(float(bandIdx) * binsPerBar);
        int binEnd = min(int(float(bandIdx + 1) * binsPerBar), 32);

        float val = 0.0;
        int count = 0;
        for (int b = 0; b < 32; b++) {
            if (b >= binStart && b < binEnd) {
                val += u_eqBands[b];
                count++;
            }
        }
        if (count > 0) val /= float(count);

        // Temporal smoothing: blend new value with previous to reduce jitter
        float prev = texture(u_prevState, uv).r;
        val = mix(val, prev, u_eqSmoothing);

        fragColor = vec4(val, 0.0, 0.0, 1.0);
    } else {
        vec4 prev = texture(u_prevState, srcUV);
        prev.r *= u_eqDecay;
        fragColor = prev;
    }
}
