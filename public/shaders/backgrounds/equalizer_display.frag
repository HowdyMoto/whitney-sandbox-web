// Display pass for Equalizer — wireframe terrain driven by EQ frequency data
// @param u_eqBrightness: float, "Brightness",  default=1.0,  min=0.2, max=3.0,  rand_min=0.5,  rand_max=2.0
// @param u_eqHeight:     float, "Peak Height",  default=1.0,  min=0.2, max=3.0,  rand_min=0.4,  rand_max=2.0
// @param u_eqHorizon:    float, "Horizon",       default=0.30, min=0.1, max=0.6,  rand_min=0.15, rand_max=0.45
// @param u_eqFog:        float, "Fog",           default=0.3,  min=0.0, max=1.0,  rand_min=0.1,  rand_max=0.6
// @param u_eqDetail:     int,   "Grid Depth",    default=40,   min=15,  max=60
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform vec3      u_backgroundColor;
uniform sampler2D u_simState;

uniform int   u_eqNumBars;
uniform float u_eqBrightness;
uniform float u_eqHeight;
uniform float u_eqHorizon;
uniform float u_eqFog;
uniform int   u_eqDetail;

// Live EQ data for the front row
uniform float u_eqBands[32];

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Get EQ height: aggregate bins into bands, return amplitude for a world X position
float getLiveHeight(float texX, int numBars) {
    float binsPerBar = 32.0 / float(numBars);
    int bandIdx = clamp(int(texX * float(numBars)), 0, numBars - 1);
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
    return (count > 0) ? val / float(count) : 0.0;
}

void main() {
    vec2 uv = v_texCoord;
    float aspect = u_resolution.x / u_resolution.y;
    vec3 color = u_backgroundColor;

    float horizon = u_eqHorizon;
    float camH = 0.6;
    float focal = 0.85;
    float pixelW = 1.0 / u_resolution.y;
    float screenX = (uv.x - 0.5) * aspect;

    int numBars = clamp(u_eqNumBars, 2, 32);
    int numRows = clamp(u_eqDetail, 15, 60);
    float terrainWidth = 8.0;
    float gridSpX = terrainWidth / float(numBars);

    float nearZ = 0.08;
    float farZ = 10.0;

    for (int row = 0; row < 60; row++) {
        if (row >= numRows) break;

        // Exponential spacing: even distribution in screen space
        float t = float(row) / float(numRows);
        float gz = nearZ * pow(farZ / nearZ, t);

        // Map depth to sim texture Y using the same log scale:
        // Far (t near 1) = newest data (texY near 0)
        // Near (t near 0) = oldest data (texY near 1)
        float texY = 1.0 - t;

        // World X for this pixel at this depth
        float wx = screenX * gz / focal;

        // Map world X to texture X [0,1]
        float texX = clamp(wx / terrainWidth + 0.5, 0.0, 1.0);

        // Sample height — blend live data for the front row (newest, at horizon)
        float simH = texture(u_simState, vec2(texX, texY)).r;

        // For the farthest rows (newest data), also blend in live EQ
        float liveH = getLiveHeight(texX, numBars);
        float liveMix = smoothstep(0.1, 0.0, texY); // texY near 0 = newest
        float rawH = mix(simH, max(simH, liveH), liveMix);

        float h = rawH * u_eqHeight * 2.0;

        // Project to screen Y
        float projY = horizon + (camH - h) * focal / gz;

        // Distance from pixel to this row's projected line
        float dy = abs(uv.y - projY);

        // Line width: thicker near camera, thinner far
        float lineW = pixelW * (0.5 + 0.6 / max(gz, 0.3));
        lineW = clamp(lineW, pixelW * 0.3, pixelW * 3.0);

        // Fog
        float fog = exp(-gz * u_eqFog * 0.06);

        // Color: hue from frequency position, brightness from height
        float bright = 0.4 + rawH * 4.0;
        vec3 lineColor = hsv2rgb(vec3(texX, 0.6 + rawH * 0.3, 1.0));
        vec3 tinted = lineColor * fog * bright * u_eqBrightness;

        // === HORIZONTAL line (Z row) ===
        float hLine = exp(-dy * dy / (lineW * lineW));
        color += tinted * hLine;

        // === VERTICAL lines (X columns at band boundaries) ===
        float nearestGX = round(wx / gridSpX) * gridSpX;
        for (int xOff = -1; xOff <= 1; xOff++) {
            float gx = nearestGX + float(xOff) * gridSpX;
            float colScreenUX = gx * focal / gz / aspect + 0.5;
            float dxCol = abs(uv.x - colScreenUX);
            float colLineW = lineW * 0.7;

            float nextT = float(row + 1) / float(numRows);
            float nextGz = nearZ * pow(farZ / nearZ, nextT);
            float rowBandH = max(abs((camH - h) * focal / gz - (camH - h) * focal / nextGz), lineW * 3.0);
            float vLine = exp(-dxCol * dxCol / (colLineW * colLineW));
            float yInBand = smoothstep(rowBandH, 0.0, dy);
            vLine *= yInBand;

            color += tinted * vLine;
        }
    }

    // Horizon line
    float hDist = abs(uv.y - horizon);
    float hLine = exp(-hDist * hDist / (pixelW * pixelW * 1.5)) * 0.3 * u_eqBrightness;
    color += vec3(0.3, 0.18, 0.5) * hLine;

    float hGlow = exp(-hDist * hDist / 0.003) * 0.06 * u_eqBrightness;
    color += vec3(0.2, 0.1, 0.3) * hGlow;

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
