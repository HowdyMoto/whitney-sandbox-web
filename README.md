# Whitney Music Box

An interactive web-based musical animation that visualizes music through geometric shapes orbiting on a canvas. Dots trace mathematical curves and play sampled instrument notes when they cross trigger points — dots are notes.

## Features

- **12 animation modes** — circular orbits, epicycles, rose curves, spirographs, pendulum waves, gravity bounces, and more, all defined as TOML files with mathematical expressions
- **6 sampled instruments** — Piano, Harp, Vibraphone, Koto, Guzheng, Pipa with 5 velocity layers each
- **37 musical scales** — chromatic, pentatonic, exotic, and world scales
- **15 background shaders** — audio-reactive WebGL2 effects including fluid simulation, kaleidoscope, sacred geometry, neural web, and more
- **Post-processing** — configurable bloom with threshold, intensity, and soft knee
- **Trail rendering** — ribbon trails, particle trails, or burst particles on note triggers
- **10 color schemes** — Prism, Consonance, Ultraviolet, Northern Lights, Ember, Watercolor, Smoke & Ash, Abyss, Golden Hour, Moss & Fern

## Controls

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| M | Toggle mute |
| R | Randomize mode |
| O | Open settings |
| K | Show piano keyboard |
| T | Cycle trail mode (ribbon / particle / none) |
| P | Toggle burst particles |
| G | Toggle dot glow |
| B | Toggle bloom |
| Scroll wheel | Adjust speed (0.1x - 4x) |
| Right-click | Randomize mode |

## Settings

Four tabs accessible via **O** or clicking the canvas:

- **Music** — instrument, scale, note range, volume, cycle duration, speed
- **Motion** — animation mode, rotation direction, mode-specific parameters, path lines, note markers
- **Style** — color scheme, dot size, glow, trails, particles, bloom
- **Background** — background color, shader effect with per-shader parameters

## Development

```bash
npm install
npm run dev       # Start dev server
npm run build     # TypeScript check + production build
npm run preview   # Preview production build
```

Requires Node 22+.

## Deployment

Pushes to `master` auto-deploy to the web server via a GitHub Actions workflow that builds the project and uploads `dist/` over SFTP.

## Tech Stack

- TypeScript (ES2023) with Vite
- WebGL2 with custom fragment shaders
- Web Audio API with polyphonic voice management (64 voices)
- TOML-based animation mode definitions with expression evaluation
# CI fix attempt
