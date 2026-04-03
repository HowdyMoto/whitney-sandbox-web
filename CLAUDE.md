# CLAUDE.md

## Project Overview

Whitney Music Box — a web-based musical animation where dots orbit along mathematical curves and trigger sampled instrument notes. Built with TypeScript, WebGL2, and Web Audio API. Bundled with Vite.

## Build & Run

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc && vite build → dist/
npm run preview   # Preview production build
```

Node 22+ required (lock file was generated with Node 22).

## Architecture

**Entry point:** `src/main.ts` → `src/App.ts` (main loop, orchestrates all systems)

**Core systems:**
- `animation/AnimationEngine.ts` — dot simulation, mode evaluation, trigger detection
- `animation/CustomModeLoader.ts` — parses TOML mode files, compiles expressions via `expr-eval`
- `audio/AudioEngine.ts` — Web Audio polyphonic playback, 64 voices, velocity layers, voice stealing
- `audio/InstrumentLibrary.ts` — instrument definitions (Piano, Harp, Vibraphone, Koto, Guzheng, Pipa)
- `music/ScaleSystem.ts` — 37 scales, MIDI↔note conversion

**Rendering (all WebGL2):**
- `rendering/DotRenderer.ts` — instanced dot rendering (core + glow)
- `rendering/TrailRenderer.ts` — ribbon trails behind dots
- `rendering/ParticleSystem.ts` — burst and trail particles
- `rendering/PathLineRenderer.ts` — orbit path guides and trigger markers
- `rendering/BackgroundShaderManager.ts` — compiles/runs 15 background shaders with metadata
- `rendering/BloomPass.ts` — post-process bloom (threshold → blur → composite)
- `rendering/ColorSchemes.ts` — 10 color palettes

**UI (DOM-based):**
- `ui/SettingsOverlay.ts` — 4-tab settings panel (Music, Motion, Style, Background)
- `ui/TransportBar.ts` — bottom play/pause/mute controls
- `ui/PianoKeyboard.ts` — 88-key keyboard overlay (canvas-rendered)

## Key Conventions

- Single mutable `Config` object (`src/types.ts`) flows through all systems. UI mutates it in-place.
- Animation modes are TOML files in `public/modes/` with `expr-eval` expressions for position/trigger.
- Background shaders in `public/shaders/backgrounds/` use comment-header metadata (`@name:`, `@param`, `@simulation:`) parsed by `BackgroundShaderManager`.
- Instrument samples live in `public/instruments/{Name}/` as MP3s with naming: `{Note}{Octave}_v{Velocity}.mp3`.
- All runtime asset paths use `import.meta.env.BASE_URL` (Vite injects `/whitney/` in production).

## Deployment

- Vite `base: '/whitney/'` in `vite.config.ts` — all assets deploy under `/whitney/` subdirectory
- GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and uploads `dist/` via SFTP on push to `master`
- SFTP credentials stored as GitHub secrets: `SFTP_HOST`, `SFTP_USERNAME`, `SFTP_PASSWORD`

## Gotchas

- New asset fetch paths must use `import.meta.env.BASE_URL` prefix, not hardcoded `/` — the site lives in a subdirectory.
- The Vite dev server plugin in `vite.config.ts` serves instrument samples from `../bin/data/instruments` (native app sibling directory). This path doesn't exist in CI — production uses `public/instruments/` instead.
- `package-lock.json` must include cross-platform optional deps. If regenerating on Windows, verify `npm ci` still works on Linux (the GitHub Actions runner).
