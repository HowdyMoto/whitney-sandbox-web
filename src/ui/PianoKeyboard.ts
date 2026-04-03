// 88-key piano keyboard that slides up from the bottom.
// Shows in-range/in-scale state and note activity glow.
// Includes a dual-thumb range slider for setting low/high notes.

import { getScale } from '../music/ScaleSystem.js';
import { getColorHSV, hsvToRgb } from '../rendering/ColorSchemes.js';
import { midiToNoteName } from '../music/ScaleSystem.js';

const PIANO_HEIGHT = 130; // keys + slider
const KEY_HEIGHT = 96;
const SLIDER_HEIGHT = 28;
const MIDI_LOW = 21;  // A0
const MIDI_HIGH = 108; // C8
const BLACK_KEY_SEMITONES = new Set([1, 3, 6, 8, 10]);
const MIN_NOTE_GAP = 12; // one octave minimum range

export class PianoKeyboard {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private visible = false;
  private noteActivity = new Float32Array(128);

  // Config references (set via setConfig)
  private lowNote = 36;
  private highNote = 84;
  private scale = 'chromatic';
  private colorScheme = 'rainbow';
  private satMul = 0.5;
  private briMul = 0.9;

  // Slider drag state
  private dragging: 'low' | 'high' | null = null;
  private onRangeChange: ((low: number, high: number) => void) | null = null;

  // Layout cache (computed on draw)
  private canvasW = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'piano-keyboard';

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = `${PIANO_HEIGHT}px`;
    this.root.appendChild(this.canvas);

    this.ctx2d = this.canvas.getContext('2d')!;

    document.body.appendChild(this.root);
    this.injectStyles();

    this.root.addEventListener('click', (e) => e.stopPropagation());

    // Slider interaction
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => this.onPointerUp());
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('visible', this.visible);
  }

  isVisible(): boolean { return this.visible; }

  setConfig(
    lowNote: number, highNote: number, scale: string,
    colorScheme: string, satMul: number, briMul: number,
    onRangeChange: (low: number, high: number) => void,
  ): void {
    this.lowNote = lowNote;
    this.highNote = highNote;
    this.scale = scale;
    this.colorScheme = colorScheme;
    this.satMul = satMul;
    this.briMul = briMul;
    this.onRangeChange = onRangeChange;
  }

  noteOn(midiNote: number): void {
    if (midiNote >= 0 && midiNote < 128) {
      this.noteActivity[midiNote] = 1;
    }
  }

  update(dt: number): void {
    if (!this.visible) return;

    for (let i = 0; i < 128; i++) {
      if (this.noteActivity[i]! > 0) {
        this.noteActivity[i]! *= Math.pow(0.05, dt);
        if (this.noteActivity[i]! < 0.01) this.noteActivity[i] = 0;
      }
    }

    this.draw();
  }

  // ─── Note color from scheme ───────────────────────────────────

  private getNoteRGB(note: number): [number, number, number] {
    const range = Math.max(this.highNote - this.lowNote, 1);
    const t = Math.max(0, Math.min(1, (note - this.lowNote) / range));
    const hsv = getColorHSV(t, this.colorScheme);
    return hsvToRgb(
      hsv.h,
      Math.min(hsv.s * this.satMul, 1),
      Math.min(hsv.v * this.briMul, 1),
    );
  }

  private noteInScale(n: number): boolean {
    const pc = ((n - this.lowNote % 12) + 120) % 12;
    const scale = getScale(this.scale);
    return scale.intervals.includes(pc);
  }

  // ─── Drawing ──────────────────────────────────────────────────

  private draw(): void {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    this.canvasW = w;
    const ctx = this.ctx2d;
    ctx.clearRect(0, 0, w, h);

    const keyH = KEY_HEIGHT * dpr;
    const sliderH = SLIDER_HEIGHT * dpr;
    const sliderY = keyH;

    // Count white keys
    let whiteCount = 0;
    for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
      if (!BLACK_KEY_SEMITONES.has(m % 12)) whiteCount++;
    }

    const maxW = Math.min(w, 1400 * dpr);
    const offsetX = (w - maxW) / 2;
    const whiteKeyW = maxW / whiteCount;
    const blackKeyW = whiteKeyW * 0.62;
    const blackKeyH = keyH * 0.62;

    // ─── White keys ─────────────────────────────────────────
    let wx = 0;
    for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
      if (BLACK_KEY_SEMITONES.has(m % 12)) continue;

      const x = offsetX + wx * whiteKeyW;
      const inRange = m >= this.lowNote && m <= this.highNote;
      const inScale = inRange && this.noteInScale(m);
      const act = this.noteActivity[m]!;

      let r = 240, g = 238, b = 235;
      let alpha = 255;

      if (!inRange) {
        alpha = 51; // 20%
      } else if (!inScale) {
        alpha = 110;
        r = 160; g = 158; b = 155;
      }

      // Active note coloring
      if (act > 0.01 && inRange) {
        const [cr, cg, cb] = this.getNoteRGB(m);
        const colorBlend = Math.min(act * 1.5, 1);
        const whiteBlend = Math.max(act - 0.4, 0) / 0.6;
        r = Math.round(r * (1 - colorBlend) + cr * 255 * colorBlend);
        g = Math.round(g * (1 - colorBlend) + cg * 255 * colorBlend);
        b = Math.round(b * (1 - colorBlend) + cb * 255 * colorBlend);
        r = Math.round(r + (255 - r) * whiteBlend);
        g = Math.round(g + (255 - g) * whiteBlend);
        b = Math.round(b + (255 - b) * whiteBlend);
      }

      ctx.fillStyle = `rgba(${r},${g},${b},${alpha / 255})`;
      ctx.fillRect(x + 0.5, 0, whiteKeyW - 1, keyH - 1);

      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, 0, whiteKeyW - 1, keyH - 1);

      wx++;
    }

    // ─── Black keys ─────────────────────────────────────────
    wx = 0;
    for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
      if (BLACK_KEY_SEMITONES.has(m % 12)) {
        const x = offsetX + wx * whiteKeyW - blackKeyW / 2;
        const inRange = m >= this.lowNote && m <= this.highNote;
        const inScale = inRange && this.noteInScale(m);
        const act = this.noteActivity[m]!;

        let r = 25, g = 25, b = 28;
        let alpha = 255;

        if (!inRange) {
          alpha = 51;
        } else if (!inScale) {
          alpha = 110;
          r = 50; g = 50; b = 53;
        }

        if (act > 0.01 && inRange) {
          const [cr, cg, cb] = this.getNoteRGB(m);
          const colorBlend = Math.min(act * 1.5, 1);
          const whiteBlend = Math.max(act - 0.4, 0) / 0.6;
          r = Math.round(r * (1 - colorBlend) + cr * 255 * colorBlend);
          g = Math.round(g * (1 - colorBlend) + cg * 255 * colorBlend);
          b = Math.round(b * (1 - colorBlend) + cb * 255 * colorBlend);
          r = Math.round(r + (255 - r) * whiteBlend);
          g = Math.round(g + (255 - g) * whiteBlend);
          b = Math.round(b + (255 - b) * whiteBlend);
        }

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha / 255})`;
        ctx.fillRect(x, 0, blackKeyW, blackKeyH);

        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, 0, blackKeyW, blackKeyH);
      } else {
        wx++;
      }
    }

    // ─── Range slider below keys ────────────────────────────
    this.drawRangeSlider(ctx, offsetX, maxW, sliderY, sliderH, dpr);
  }

  private drawRangeSlider(
    ctx: CanvasRenderingContext2D,
    offsetX: number, trackW: number,
    y: number, h: number, dpr: number,
  ): void {
    const totalNotes = MIDI_HIGH - MIDI_LOW;
    const midiToX = (m: number) => offsetX + ((m - MIDI_LOW) / totalNotes) * trackW;

    const trackY = y + h / 2 - 1.5 * dpr;
    const trackH = 3 * dpr;
    const thumbR = 10 * dpr;

    // Track background
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(offsetX, trackY, trackW, trackH, trackH / 2);
    ctx.fill();

    // Active range fill
    const lowX = midiToX(this.lowNote);
    const highX = midiToX(this.highNote);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(lowX, trackY, highX - lowX, trackH);

    // Thumbs
    for (const [midi, isDragging] of [[this.lowNote, this.dragging === 'low'], [this.highNote, this.dragging === 'high']] as [number, boolean][]) {
      const tx = midiToX(midi);
      const ty = y + h / 2;

      // Circle
      ctx.beginPath();
      ctx.arc(tx, ty, thumbR, 0, Math.PI * 2);
      ctx.fillStyle = isDragging ? '#ffffff' : '#c8c8d2';
      ctx.fill();

      // Label inside thumb
      const label = midiToNoteName(midi);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.font = `500 ${9 * dpr}px 'Outfit', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx, ty + 0.5 * dpr);
    }
  }

  // ─── Slider interaction ───────────────────────────────────────

  private xToMidi(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (clientX - rect.left) * dpr;
    const totalNotes = MIDI_HIGH - MIDI_LOW;
    const canvasW = this.canvasW;
    const maxW = Math.min(canvasW, 1400 * dpr);
    const offsetX = (canvasW - maxW) / 2;
    const midi = MIDI_LOW + ((x - offsetX) / maxW) * totalNotes;
    return Math.round(Math.max(MIDI_LOW, Math.min(MIDI_HIGH, midi)));
  }

  private onPointerDown(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const y = (e.clientY - rect.top) * dpr;
    const sliderY = KEY_HEIGHT * dpr;

    // Only respond to clicks in the slider area
    if (y < sliderY) return;

    const midi = this.xToMidi(e.clientX);
    const distLow = Math.abs(midi - this.lowNote);
    const distHigh = Math.abs(midi - this.highNote);

    this.dragging = distLow <= distHigh ? 'low' : 'high';
    this.canvas.setPointerCapture(e.pointerId);
    this.updateDrag(e.clientX);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    this.updateDrag(e.clientX);
  }

  private onPointerUp(): void {
    this.dragging = null;
  }

  private updateDrag(clientX: number): void {
    const midi = this.xToMidi(clientX);

    if (this.dragging === 'low') {
      this.lowNote = Math.min(midi, this.highNote - MIN_NOTE_GAP);
      this.lowNote = Math.max(MIDI_LOW, this.lowNote);
    } else if (this.dragging === 'high') {
      this.highNote = Math.max(midi, this.lowNote + MIN_NOTE_GAP);
      this.highNote = Math.min(MIDI_HIGH, this.highNote);
    }

    this.onRangeChange?.(this.lowNote, this.highNote);
  }

  getHeight(): number {
    return this.visible ? PIANO_HEIGHT : 0;
  }

  private injectStyles(): void {
    if (document.getElementById('piano-styles')) return;
    const s = document.createElement('style');
    s.id = 'piano-styles';
    s.textContent = `
.piano-keyboard {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: ${PIANO_HEIGHT}px;
  z-index: 35;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  background: rgba(10, 10, 16, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.piano-keyboard.visible {
  transform: translateY(0);
  pointer-events: auto;
}
`;
    document.head.appendChild(s);
  }
}
