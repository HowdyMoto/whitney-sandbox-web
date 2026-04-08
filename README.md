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

## Creating Animation Modes

Animation modes are TOML files in `public/modes/`. Each mode defines how dots move, when they trigger notes, and how their paths are visualized — all through mathematical expressions evaluated per-dot, per-frame.

### File structure

```toml
name = "My Mode"
description = "What this mode does"
supportsRotation = true    # let user control rotation direction (default: true)
isLinear = false           # use [0,1] endpoint spacing instead of [0,1) circular (default: false)

[params.myParam]
label = "My Parameter"
default = 1.0
min = 0.0
max = 2.0
step = 0.1                # omit or set to 0 for continuous

[params.myDropdown]
label = "Style"
default = 0.0
min = 0.0
max = 1.0
options = [["Option A", 0.0], ["Option B", 1.0]]

[position]
x = "cx + amplitude * cos(phase)"
y = "cy - amplitude * sin(phase)"

[trigger]
value = "fmod(cycleProgress * speed, 1.0)"

[marker.1]
x = "cx + amplitude * cos(pi() / 2)"
y = "cy - amplitude * sin(pi() / 2)"

[path]
x = "cx + amplitude * cos(sweep)"
y = "cy - amplitude * sin(sweep)"
range_min = "0"
range_max = "two_pi()"
```

### Sections

| Section | Required | Purpose |
|---------|----------|---------|
| `[position]` | Yes | `x` and `y` expressions for each dot's position |
| `[trigger]` | No | Expression returning [0,1) that fires a note when near 0. Default: `fmod(cycleProgress * speed, 1.0)` |
| `[marker.N]` | No | Fixed reference points (trigger positions, endpoints). Number markers sequentially. |
| `[path]` | No | Draws the dot's full trajectory using `sweep` variable. If omitted, position is swept over phase. |
| `[params.*]` | No | User-adjustable parameters (up to 8). Renders as slider or dropdown depending on whether `options` is present. |

### Context variables

Available in all expressions:

| Variable | Description |
|----------|-------------|
| `i` | Dot index (0 to numDots-1) |
| `t` | Normalized dot position: `i/numDots` (circular) or `i/(numDots-1)` (linear) |
| `speed` | Dot's harmonic speed (`i + 1`) |
| `cycleProgress` | Master animation progress [0,1), resets each cycle |
| `localT` | Per-dot progress: `(cycleProgress * speed) % 1` |
| `phase` | Rotation angle in radians (direction-aware when `supportsRotation = true`) |
| `cx`, `cy` | Screen center |
| `maxRadius` | Maximum orbit radius (`min(screenW, screenH) * 0.45`) |
| `amplitude` | Per-dot radius: `maxRadius * (0.15 + t * 0.85)` |
| `screenW`, `screenH` | Viewport dimensions |
| `sweep` | Path-only: ranges from `range_min` to `range_max` to trace the trajectory |
| Custom params | Accessed directly by name (e.g. `myParam`, `sweepMode`) |

### Expression functions

Standard math: `sin`, `cos`, `tan`, `abs`, `sqrt`, `floor`, `ceil`, `min`, `max`, `pow`

Custom:
| Function | Description |
|----------|-------------|
| `pi()` | Pi (3.14159...) |
| `two_pi()` | 2 * Pi (6.28318...) |
| `fmod(a, b)` | Float modulo (handles negatives correctly) |
| `if(cond, a, b)` | Ternary — returns `a` if cond is nonzero, else `b`. Nestable. |

Operators: `+`, `-`, `*`, `/`, `%`, `<`, `>`, `<=`, `>=`, `==`, `!=`, `&&`, `||`

### Trigger patterns

Trigger fires when the value is within 0.5% of 0 or 1. Common patterns:

```toml
# Once per orbit (default) — for modes where dots return to a fixed point
value = "fmod(cycleProgress * speed, 1.0)"

# Twice per orbit — for bounce modes (trigger at both endpoints)
value = "fmod(cycleProgress * speed * 2, 1.0)"

# Conditional — different behavior per parameter
value = "if(sweepMode > 0.5, localT, fmod(cycleProgress * speed * 2, 1.0))"
```

### Flags

**`supportsRotation`** (default: `true`) — When true, `phase` incorporates the user's rotation direction setting (clockwise, counterclockwise, alternating, pingpong). Set to `false` for linear/arc modes where rotation doesn't apply.

**`isLinear`** (default: `false`) — Controls how `t` is calculated. Circular modes use `t = i/numDots` so dots don't overlap at the wrap point. Linear modes use `t = i/(numDots-1)` so dots reach both endpoints symmetrically.

### Tips

- Use `amplitude` for per-dot sizing so inner dots are smaller, outer dots larger
- Use `phase` (not raw `cycleProgress`) for rotation so direction control works
- If dots teleport (one-way sweeps), ribbon trails auto-break at large position jumps
- Test with different `numNotes` values — expressions should scale gracefully
- Check the browser console for expression parse errors
