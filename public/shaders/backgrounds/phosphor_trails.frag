// @name: Phosphor Trails
// @simulation: true
// @simsteps: 1
// @param u_ioLineWidth:    float, "Trail Width",     default=3.0,  min=0.5, max=10.0, rand_min=1.0, rand_max=6.0
// @param u_ioTrailDecay:   float, "Trail Persistence", default=0.985, min=0.95, max=0.999, rand_min=0.975, rand_max=0.995, fmt="%.3f"
// @param u_ioCircleSize:   float, "Pulse Ring Size",  default=30.0, min=10.0, max=80.0, rand_min=15.0, rand_max=50.0
// @param u_ioBrightness:   float, "Brightness",      default=0.7,  min=0.1, max=1.5,  rand_min=0.3, rand_max=1.0
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform int       u_numDots;
uniform vec4      u_dots[256];
uniform float     u_dotTrigger[256];
uniform sampler2D u_prevState;
uniform vec2      u_texelSize;

uniform float u_ioLineWidth;
uniform float u_ioTrailDecay;
uniform float u_ioCircleSize;
uniform float u_ioBrightness;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = v_texCoord;
    vec2 pixel = uv * u_resolution;

    // Read previous frame and decay
    vec3 prev = texture(u_prevState, uv).rgb * u_ioTrailDecay;

    // Deposit trail points at each dot's current position
    float invR2 = 1.0 / (u_ioLineWidth * u_ioLineWidth);

    for (int i = 0; i < u_numDots; i++) {
        vec2 dotPos = u_dots[i].xy;
        float hue = u_dots[i].w;
        float trigger = u_dotTrigger[i];

        vec2 diff = pixel - dotPos;
        float dist2 = dot(diff, diff);

        // Trail deposit: Gaussian splat
        float cutoff = u_ioLineWidth * 4.0;
        if (dist2 > cutoff * cutoff) continue;

        float deposit = exp(-dist2 * invR2);

        // Boost on trigger
        float boost = 1.0 + trigger * 3.0;

        vec3 dotColor = hsv2rgb(vec3(hue, 0.8, 1.0));
        prev += dotColor * deposit * u_ioBrightness * boost * 0.4;

        // Trigger circle: expanding ring
        if (trigger > 0.01) {
            float dist = sqrt(dist2);
            float ringRadius = u_ioCircleSize * (1.0 - trigger * 0.5);
            float ringDist = abs(dist - ringRadius);
            float ring = smoothstep(3.0, 0.5, ringDist) * trigger;
            prev += dotColor * ring * u_ioBrightness * 0.5;
        }
    }

    fragColor = vec4(max(prev, vec3(0.0)), 1.0);
}
