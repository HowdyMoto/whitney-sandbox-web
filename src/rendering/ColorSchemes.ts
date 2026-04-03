import type { HSVColor } from '../types.js';

// Consonance-to-warmth palette for harmonic color scheme
const HARMONIC_PALETTE: [number, number, number][] = [
  [1.000, 0.961, 0.878],  // Root White
  [0.961, 0.784, 0.259],  // Octave Gold
  [0.910, 0.627, 0.188],  // Fifth Amber
  [0.878, 0.471, 0.157],  // Fourth Orange
  [0.847, 0.314, 0.125],  // Third Red
  [0.753, 0.251, 0.251],  // Minor Rust
  [0.502, 0.502, 0.753],  // Seventh Blue
  [0.376, 0.376, 0.627],  // Ninth Steel
  [0.282, 0.282, 0.596],  // Outside Violet
];

function rgbToHsv(r: number, g: number, b: number): HSVColor {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const delta = maxC - minC;

  const v = maxC;
  const s = maxC > 0.0001 ? delta / maxC : 0;

  let h: number;
  if (delta < 0.0001) {
    h = 0;
  } else if (maxC === r) {
    h = (((g - b) / delta) % 6) / 6;
    if (h < 0) h += 1;
  } else if (maxC === g) {
    h = ((b - r) / delta + 2) / 6;
  } else {
    h = ((r - g) / delta + 4) / 6;
  }

  return { h, s, v };
}

export function getColorHSV(t: number, colorScheme: string, dotIndex: number = -1): HSVColor {
  if (colorScheme === 'harmonic') {
    const n = dotIndex >= 0 ? dotIndex + 1 : Math.floor(t * 15) + 1;
    const consonance = 1 / Math.log2(Math.max(n, 1) + 1);
    let paletteT = 1 - consonance;
    paletteT = Math.max(0, Math.min(1, paletteT));

    const pos = paletteT * 8;
    const lo = Math.min(Math.floor(pos), 8);
    const hi = Math.min(lo + 1, 8);
    const frac = pos - lo;

    const r = HARMONIC_PALETTE[lo]![0] + (HARMONIC_PALETTE[hi]![0] - HARMONIC_PALETTE[lo]![0]) * frac;
    const g = HARMONIC_PALETTE[lo]![1] + (HARMONIC_PALETTE[hi]![1] - HARMONIC_PALETTE[lo]![1]) * frac;
    const b = HARMONIC_PALETTE[lo]![2] + (HARMONIC_PALETTE[hi]![2] - HARMONIC_PALETTE[lo]![2]) * frac;

    return rgbToHsv(r, g, b);
  }

  if (colorScheme === 'rainbow')  return { h: t, s: 0.85, v: 0.92 };
  if (colorScheme === 'neon')     return { h: 0.85 + t * 0.35, s: 1, v: 1 };
  if (colorScheme === 'aurora')   return { h: 0.3 + t * 0.45, s: 0.75, v: 0.88 };
  if (colorScheme === 'fire')     return { h: t * 0.12, s: 1, v: 0.98 };
  if (colorScheme === 'pastel')   return { h: t, s: 0.45, v: 0.92 };
  if (colorScheme === 'mono')     return { h: 0, s: 0, v: 0.55 + t * 0.45 };
  if (colorScheme === 'ocean')    return { h: 0.5 + t * 0.18, s: 0.75, v: 0.85 };
  if (colorScheme === 'sunset')   return { h: 0.02 + t * 0.25, s: 0.9, v: 0.95 };
  if (colorScheme === 'forest')   return { h: 0.25 + t * 0.2, s: 0.7 + Math.sin(t * Math.PI) * 0.2, v: 0.85 };

  // default
  return { h: t, s: 0.8, v: 0.9 };
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r: number, g: number, b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }

  return [r, g, b];
}
