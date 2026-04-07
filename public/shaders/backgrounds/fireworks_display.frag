// Display shader for Fireworks simulation
// @param u_brightness:  float, "Brightness",   default=1.0,  min=0.2, max=3.0, rand_min=0.5, rand_max=2.0
// @param u_bloom:       float, "Bloom",        default=0.35, min=0.0, max=2.0, rand_min=0.1, rand_max=1.0
// @param u_saturation:  float, "Saturation",   default=0.85, min=0.0, max=1.0, rand_min=0.4, rand_max=1.0
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform vec3      u_backgroundColor;
uniform sampler2D u_simState;
uniform vec2      u_texelSize;

uniform float u_brightness;
uniform float u_bloom;
uniform float u_saturation;

// -------------------------------------------------------
float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// -------------------------------------------------------
// Multi-scale bloom — fixed radii, u_bloom controls intensity
// -------------------------------------------------------
// Use v_fbUV (GL convention, no Y-flip) for all FBO texture reads
vec3 sampleBloom(vec2 fbUV, float radius) {
    vec2 ts = u_texelSize * radius;
    vec3 s  = texture(u_simState, fbUV).rgb * 4.0;
    s += texture(u_simState, fbUV + vec2( ts.x, 0.0)).rgb * 2.0;
    s += texture(u_simState, fbUV - vec2( ts.x, 0.0)).rgb * 2.0;
    s += texture(u_simState, fbUV + vec2(0.0,  ts.y)).rgb * 2.0;
    s += texture(u_simState, fbUV - vec2(0.0,  ts.y)).rgb * 2.0;
    s += texture(u_simState, fbUV + vec2( ts.x,  ts.y)).rgb;
    s += texture(u_simState, fbUV - vec2( ts.x,  ts.y)).rgb;
    s += texture(u_simState, fbUV + vec2( ts.x, -ts.y)).rgb;
    s += texture(u_simState, fbUV - vec2( ts.x, -ts.y)).rgb;
    return s / 16.0;
}

void main() {
    vec2 uv = v_texCoord;
    vec2 fbUV = v_fbUV; // GL convention for FBO readback

    vec3 sharp = texture(u_simState, fbUV).rgb;

    // Three fixed-radius bloom taps
    vec3 bloom1 = sampleBloom(fbUV, 3.0);        // near glow
    vec3 bloom2 = sampleBloom(fbUV, 9.0);        // mid glow
    vec3 bloom3 = sampleBloom(fbUV, 21.0);       // atmospheric haze

    vec3 bloomTotal = bloom1 * 0.50
                    + bloom2 * 0.30
                    + bloom3 * 0.20;

    vec3 hdr = sharp + bloomTotal * u_bloom;
    hdr *= u_brightness;

    // Hot-core white shift
    float lum = dot(hdr, vec3(0.299, 0.587, 0.114));
    float whiteShift = clamp(lum * 0.4, 0.0, 0.6);
    hdr = mix(hdr, vec3(lum), whiteShift);

    // Saturation
    float grey = dot(hdr, vec3(0.299, 0.587, 0.114));
    hdr = mix(vec3(grey), hdr, u_saturation);

    // Reinhard tone-map
    hdr = hdr / (1.0 + hdr);

    // Per-pixel sparkle
    float sparkleNoise = hash21(floor(uv * u_resolution) + vec2(u_time * 97.0));
    float sparkleMask  = pow(sparkleNoise, 22.0) * lum;
    hdr += vec3(sparkleMask) * 0.25;

    vec3 color = u_backgroundColor + hdr;

    // Subtle vignette
    float vDist = length(uv - 0.5);
    color *= 1.0 - vDist * vDist * 0.35;

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
