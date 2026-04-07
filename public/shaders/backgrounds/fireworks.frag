// @name: Fireworks
// @simulation: true
// @simsteps: 1
// @param u_trailDecay:  float, "Trail Length",  default=0.88,  min=0.70, max=0.985, rand_min=0.82, rand_max=0.95, fmt="%.3f"
// @param u_burstScale:  float, "Burst Scale",   default=1.0,   min=0.3,  max=2.0,   rand_min=0.5,  rand_max=1.25
// @param u_gravity:     float, "Gravity",       default=100.0, min=0.0,  max=200.0, rand_min=40.0, rand_max=100.0, fmt="%.0f"
// @param u_emitSpeed:   float, "Emit Speed",    default=1.0,   min=0.2,  max=1.5,   rand_min=0.4,  rand_max=1.0
// @param u_sparkle:     float, "Sparkle",       default=0.5,   min=0.0,  max=1.0,   rand_min=0.2,  rand_max=0.9
// @param u_pSize:       float, "Particle Size", default=1.0,   min=0.3,  max=3.0,   rand_min=0.5,  rand_max=2.0
// @param u_pCount:      float, "Particle Count",default=1.0,   min=0.3,  max=4.0,   rand_min=0.5,  rand_max=2.0
// @param u_sizeVar:     float, "Size Variety",  default=1.0,   min=0.0,  max=1.0,   rand_min=0.3,  rand_max=1.0
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform int       u_numTriggerEvents;
uniform vec4      u_triggerEvents[64]; // .xy = pos, .z = hue, .w = birth time
uniform sampler2D u_prevState;
uniform vec2      u_texelSize;

uniform float u_trailDecay;
uniform float u_burstScale;
uniform float u_gravity;
uniform float u_emitSpeed;
uniform float u_sparkle;
uniform float u_pSize;
uniform float u_pCount;
uniform float u_sizeVar;

// -------------------------------------------------------
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv    = v_texCoord;
    vec2 pixel = uv * u_resolution;

    // Use v_fbUV for FBO readback (GL convention, no Y-flip)
    vec3 accum = texture(u_prevState, v_fbUV).rgb * u_trailDecay;

    const float MAX_AGE     = 3.5;
    const float BASE_DRAG   = 2.2;
    const int   MAX_MAIN    = 56;
    const int   MAX_CRACK   = 24;
    const int   MAX_EMBER   = 12;
    const int   MAX_GLITTER = 32;
    const int   MAX_STREAM  = 12;

    for (int e = 0; e < u_numTriggerEvents; e++) {
        vec2  origin    = u_triggerEvents[e].xy;
        float hue       = u_triggerEvents[e].z;
        float birthTime = u_triggerEvents[e].w;
        float age       = u_time - birthTime;

        if (age < 0.0 || age > MAX_AGE) continue;

        float nf = hue;

        float baseSpeed   = mix(380.0, 140.0, nf) * u_burstScale * u_emitSpeed;
        float speedSpread = mix(180.0,  60.0, nf) * u_burstScale * u_emitSpeed;
        // Smaller minimum: high-freq particles down to ~1px
        float pSizeBase   = mix(3.5, 1.0, nf) * u_burstScale;
        float burstLife   = mix(3.0, 1.0, nf);
        int   mainCount   = min(int(mix(float(MAX_MAIN), 14.0, nf) * u_pCount), MAX_MAIN);
        int   crackCount  = min(int(mix(5.0, float(MAX_CRACK), nf) * u_pCount), MAX_CRACK);
        int   glitCount   = min(int(mix(8.0, float(MAX_GLITTER), nf) * u_pCount), MAX_GLITTER);

        // --- KEY PERF FIX: gravity translates the burst center,
        // it does NOT expand the radius. Shift the center instead
        // of inflating the bounding sphere. ---
        vec2 gravOffset  = vec2(0.0, u_gravity * age * age * 0.5);
        vec2 burstCenter = origin + gravOffset;
        // Bounding radius is now just the speed-based spread
        float burstR  = (baseSpeed * 1.5) / BASE_DRAG + 150.0;
        float burstR2 = burstR * burstR;
        vec2  toBurst = pixel - burstCenter;
        float dist2   = dot(toBurst, toBurst);    // no sqrt
        if (dist2 > burstR2) continue;

        float eSeed = birthTime * 127.1 + float(e) * 311.7;

        // =======================================================
        //  Initial flash
        // =======================================================
        if (age < 0.08) {
            float flashR  = mix(12.0, 5.0, nf) * u_burstScale;
            float dFlash  = length(pixel - origin);
            float flash   = exp(-dFlash * dFlash / (flashR * flashR))
                          * (1.0 - age / 0.08) * 0.6;
            accum += vec3(1.0, 0.95, 0.85) * flash;
        }

        // Precompute gravity term for this event's age
        float burstDelay = 0.02;

        // =======================================================
        //  Main burst — per-particle size + drag variation
        // =======================================================
        if (age > burstDelay) {
            float t = age - burstDelay;
            float gravY = u_gravity * t * t * 0.5;

            for (int p = 0; p < MAX_MAIN; p++) {
                if (p >= mainCount) break;

                float seed  = eSeed + float(p) * 43.758;
                float angle = hash11(seed) * 6.28318;
                float sMult = 0.5 + hash11(seed + 1.0) * 1.0;
                float speed = baseSpeed * sMult
                            + (hash11(seed + 2.0) - 0.5) * speedSpread;

                float pDrag = 1.5 + hash11(seed + 6.0) * 1.7;
                float eDrag = exp(-pDrag * t);

                vec2 vel = vec2(cos(angle), sin(angle)) * speed;
                vec2 pos = origin + vel / pDrag * (1.0 - eDrag);
                pos.y   += gravY;

                float life   = burstLife * (0.5 + hash11(seed + 3.0) * 1.0);
                float bright = smoothstep(0.0, 0.06, t) * exp(-t * 2.5 / life) * 0.8;

                float twinkle = hash11(seed + floor(u_time * 30.0) * 0.17);
                float flashC  = smoothstep(0.5, 0.95, twinkle) * 2.5;
                float dimC    = smoothstep(0.3, 0.0, twinkle) * 0.8;
                bright *= mix(1.0, 0.2 + flashC - dimC, u_sparkle);

                // Per-particle size with variety control
                float pSize = pSizeBase * mix(1.0, 0.3 + hash11(seed + 7.0) * 1.3, u_sizeVar) * u_pSize;
                float s2    = pSize * pSize;

                vec2  diff = pixel - pos;
                float d2   = dot(diff, diff);
                if (d2 > s2 * 4.0) continue;
                float glow = pow(max(1.0 - d2 / (s2 * 1.5), 0.0), 3.0);

                float h   = fract(hue + (hash11(seed + 5.0) - 0.5) * 0.08);
                float sat = mix(0.9, 0.35, t / life);
                accum += hsv2rgb(vec3(h, sat, 1.0)) * glow * bright;
            }
        }

        // =======================================================
        //  Glitter dust — tiny pinpoint sparks, rapid twinkling
        // =======================================================
        if (age > 0.01) {
            float gt    = age - 0.01;
            float gravG = u_gravity * gt * gt * 0.5;

            for (int g = 0; g < MAX_GLITTER; g++) {
                if (g >= glitCount) break;

                float gSeed  = eSeed + float(g) * 61.97 + 2000.0;
                float gAngle = hash11(gSeed) * 6.28318;
                float gSpeed = baseSpeed * (0.3 + hash11(gSeed + 1.0) * 1.4) * 1.1;
                float gDrag  = 1.8 + hash11(gSeed + 2.0) * 2.0;
                float geDrag = exp(-gDrag * gt);

                vec2 gVel = vec2(cos(gAngle), sin(gAngle)) * gSpeed;
                vec2 gPos = origin + gVel / gDrag * (1.0 - geDrag);
                gPos.y   += gravG;

                float gLife = mix(1.8, 0.6, nf) * (0.4 + hash11(gSeed + 3.0) * 1.2);
                float gBrt  = smoothstep(0.0, 0.03, gt)
                            * exp(-gt * 3.0 / gLife) * 0.5;

                float gTwinkle = hash11(gSeed + floor(u_time * 50.0) * 0.31);
                float gFlash   = smoothstep(0.55, 1.0, gTwinkle) * 3.5;
                gBrt *= mix(0.6, 0.05 + gFlash, u_sparkle);

                // Tiny kernels: sub-pixel pinpoints
                float gSize = mix(1.2, 0.4, nf) * mix(1.0, 0.5 + hash11(gSeed + 4.0) * 0.8, u_sizeVar)
                            * u_burstScale * u_pSize;
                float gs2   = gSize * gSize;

                vec2  gDiff = pixel - gPos;
                float gd2   = dot(gDiff, gDiff);
                if (gd2 > gs2 * 4.0) continue;
                float gGlow = pow(max(1.0 - gd2 / (gs2 * 1.5), 0.0), 3.0);

                float gh   = fract(hue + (hash11(gSeed + 5.0) - 0.5) * 0.15);
                float gSat = mix(0.5, 0.2, gt / gLife);
                accum += hsv2rgb(vec3(gh, gSat, 1.0)) * gGlow * gBrt;
            }
        }

        // =======================================================
        //  Streamers — low-drag graceful arcs (willow effect)
        // =======================================================
        if (age > burstDelay) {
            float st    = age - burstDelay;
            float gravS = u_gravity * st * st * 0.5;

            int streamCount = min(int(float(MAX_STREAM) * u_pCount), MAX_STREAM);
            for (int s = 0; s < MAX_STREAM; s++) {
                if (s >= streamCount) break;
                float sSeed  = eSeed + float(s) * 53.47 + 3000.0;
                float sAngle = hash11(sSeed) * 6.28318;
                float sSpeed = baseSpeed * (0.6 + hash11(sSeed + 1.0) * 0.5);
                float sDrag  = 0.5 + hash11(sSeed + 2.0) * 0.6;
                float seDrag = exp(-sDrag * st);

                vec2 sVel = vec2(cos(sAngle), sin(sAngle)) * sSpeed;
                vec2 sPos = origin + sVel / sDrag * (1.0 - seDrag);
                sPos.y   += gravS;

                float sLife = burstLife * 1.3;
                float sBrt  = smoothstep(0.0, 0.1, st)
                            * exp(-st * 1.5 / sLife) * 0.6;

                float sTwinkle = hash11(sSeed + floor(u_time * 25.0) * 0.19);
                sBrt *= mix(1.0, 0.4 + smoothstep(0.6, 1.0, sTwinkle) * 1.5, u_sparkle);

                float sSize = pSizeBase * mix(1.0, 0.4 + hash11(sSeed + 3.0) * 0.6, u_sizeVar) * u_pSize;
                float ss2   = sSize * sSize;

                vec2  sDiff = pixel - sPos;
                float sd2   = dot(sDiff, sDiff);
                if (sd2 > ss2 * 4.0) continue;
                float sGlow = pow(max(1.0 - sd2 / (ss2 * 1.5), 0.0), 3.0);

                float sh   = fract(hue + (hash11(sSeed + 4.0) - 0.5) * 0.04);
                float sSat = mix(0.8, 0.3, st / sLife);
                accum += hsv2rgb(vec3(sh, sSat, 1.0)) * sGlow * sBrt;
            }
        }

        // =======================================================
        //  Secondary crackle
        // =======================================================
        float crackDelay = mix(0.5, 0.25, nf);
        if (age > crackDelay) {
            float ct     = age - crackDelay;
            float cDRAG  = BASE_DRAG * 1.6;
            float ceDrag = exp(-cDRAG * ct);
            float gravC  = u_gravity * ct * ct * 0.5;

            float pT     = crackDelay - burstDelay;

            for (int c = 0; c < MAX_CRACK; c++) {
                if (c >= crackCount) break;

                int   pi     = c / 2;
                float pSeed  = eSeed + float(pi) * 43.758;
                float pAngle = hash11(pSeed) * 6.28318;
                float ppDrag = 1.5 + hash11(pSeed + 6.0) * 1.7;
                float pSpeed = baseSpeed * (0.5 + hash11(pSeed + 1.0) * 1.0);
                vec2  pVel   = vec2(cos(pAngle), sin(pAngle)) * pSpeed;
                vec2  pPos   = origin + pVel / ppDrag * (1.0 - exp(-ppDrag * pT));
                pPos.y      += u_gravity * pT * pT * 0.5;

                float cSeed  = eSeed + float(c) * 97.13 + 500.0;
                float cAngle = hash11(cSeed) * 6.28318;
                float cSpeed = mix(110.0, 65.0, nf)
                             * (0.4 + hash11(cSeed + 1.0) * 0.8)
                             * u_burstScale * u_emitSpeed;
                vec2  cVel   = vec2(cos(cAngle), sin(cAngle)) * cSpeed;
                vec2  cPos   = pPos + cVel / cDRAG * (1.0 - ceDrag);
                cPos.y      += gravC;

                float cLife  = mix(0.9, 0.4, nf)
                             * (0.5 + hash11(cSeed + 2.0) * 1.0);
                float cBrt   = smoothstep(0.0, 0.04, ct)
                             * exp(-ct * 3.0 / cLife) * 0.5;

                float cTwinkle = hash11(cSeed + floor(u_time * 40.0) * 0.13);
                float cFlash   = smoothstep(0.6, 1.0, cTwinkle) * 3.0;
                cBrt *= mix(1.0, 0.1 + cFlash, u_sparkle);

                // Per-particle size: very small crackle sparks
                float cSize = pSizeBase * mix(1.0, 0.2 + hash11(cSeed + 6.0) * 0.5, u_sizeVar) * u_pSize;
                float cs2   = cSize * cSize;

                vec2  cDiff = pixel - cPos;
                float cd2   = dot(cDiff, cDiff);
                if (cd2 > cs2 * 4.0) continue;
                float cGlow = pow(max(1.0 - cd2 / (cs2 * 1.5), 0.0), 3.0);

                float ch = fract(hue + (hash11(cSeed + 4.0) - 0.5) * 0.15);
                accum += hsv2rgb(vec3(ch, 0.7, 1.0)) * cGlow * cBrt;
            }
        }

        // =======================================================
        //  Falling embers
        // =======================================================
        float emberDelay = 0.15;
        if (age > emberDelay) {
            float et      = age - emberDelay;
            float emDRAG  = 0.8;
            float emeDrag = exp(-emDRAG * et);
            float gravE   = u_gravity * 0.5 * et * et * 0.5;

            int emberCount = min(int(float(MAX_EMBER) * u_pCount), MAX_EMBER);
            for (int em = 0; em < MAX_EMBER; em++) {
                if (em >= emberCount) break;
                float emSeed  = eSeed + float(em) * 71.37 + 1000.0;
                float emAngle = hash11(emSeed) * 6.28318;
                float emSpeed = mix(260.0, 100.0, nf)
                              * (0.3 + hash11(emSeed + 1.0) * 0.7)
                              * u_burstScale * u_emitSpeed;

                vec2 emVel = vec2(cos(emAngle), sin(emAngle)) * emSpeed;
                vec2 emPos = origin + emVel / emDRAG * (1.0 - emeDrag);
                emPos.y   += gravE;

                float emLife = mix(3.5, 1.5, nf);
                float emBrt  = exp(-et * 1.0 / emLife) * 0.4;

                float emTwinkle = hash11(emSeed + floor(u_time * 20.0) * 0.23);
                float emFlash   = smoothstep(0.7, 1.0, emTwinkle) * 3.0;
                emBrt *= mix(0.5, 0.05 + emFlash, u_sparkle);

                // Per-particle size: smallest embers
                float emSize = pSizeBase * mix(1.0, 0.15 + hash11(emSeed + 5.0) * 0.55, u_sizeVar) * u_pSize;
                float ems2   = emSize * emSize;

                vec2  emDiff = pixel - emPos;
                float emd2   = dot(emDiff, emDiff);
                if (emd2 > ems2 * 4.0) continue;
                float emGlow = pow(max(1.0 - emd2 / (ems2 * 1.5), 0.0), 3.0);

                float emH = fract(hue + 0.05 + hash11(emSeed + 3.0) * 0.06);
                accum += hsv2rgb(vec3(emH, 0.45, 1.0)) * emGlow * emBrt;
            }
        }
    }

    fragColor = vec4(accum, 1.0);
}
