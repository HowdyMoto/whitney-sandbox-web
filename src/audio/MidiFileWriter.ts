import { getMidiNoteForDot } from '../music/ScaleSystem.js';
import type { Config } from '../types.js';

/**
 * Minimal Standard MIDI File (SMF) Type 0 writer.
 * Encodes one full cycle of the Whitney Music Box pattern.
 */

const NOTE_DURATION_TICKS = 240;   // half a beat per hit
const TICKS_PER_QUARTER = 480;     // MIDI resolution

// ─── Variable-length quantity encoding (MIDI spec) ──────────────

function writeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  const bytes: number[] = [];
  bytes.unshift(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

function writeUint16(v: number): number[] {
  return [(v >> 8) & 0xff, v & 0xff];
}

function writeUint32(v: number): number[] {
  return [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

// ─── Event computation ──────────────────────────────────────────

interface MidiEvent {
  tick: number;
  type: 'on' | 'off';
  midiNote: number;
  velocity: number;  // 0-127
}

/**
 * Compute every MIDI event (note-on + note-off) for one full cycle.
 *
 * Each dot i has speed (i+1) and triggers (i+1) times per cycle.
 * Trigger k fires at cycleProgress = k / speed, i.e. at
 * tick = (k / speed) * totalTicks.
 */
function computeCycleEvents(config: Config): { events: MidiEvent[]; totalTicks: number } {
  const { numNotes, cycleDuration, scale, lowNote, highNote } = config;
  const totalTicks = cycleDuration * TICKS_PER_QUARTER;
  const events: MidiEvent[] = [];

  for (let i = 0; i < numNotes; i++) {
    const speed = i + 1;
    const midiNote = getMidiNoteForDot(i, scale, lowNote, highNote);
    const velocity = 73; // matches 0.57 normalized value in AnimationEngine

    for (let k = 0; k < speed; k++) {
      const onTick = Math.round((k / speed) * totalTicks);
      const offTick = Math.min(onTick + NOTE_DURATION_TICKS, totalTicks);
      events.push({ tick: onTick, type: 'on', midiNote, velocity });
      events.push({ tick: offTick, type: 'off', midiNote, velocity: 0 });
    }
  }

  // Sort by tick, note-offs before note-ons at same tick, then by pitch
  events.sort((a, b) =>
    a.tick - b.tick
    || (a.type === 'off' ? 0 : 1) - (b.type === 'off' ? 0 : 1)
    || a.midiNote - b.midiNote
  );
  return { events, totalTicks };
}

// ─── MIDI file assembly ─────────────────────────────────────────

/**
 * Build a complete Standard MIDI File (Type 0, single track).
 */
export function buildMidiFile(config: Config): Uint8Array {
  const { events, totalTicks } = computeCycleEvents(config);

  // 60 BPM: 1 quarter note = 1 second, so total duration = cycleDuration seconds
  const tempo = 1_000_000;

  const trackBytes: number[] = [];

  // Tempo meta event at tick 0
  trackBytes.push(0x00);
  trackBytes.push(0xff, 0x51, 0x03);
  trackBytes.push((tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);

  // All events as a flat sorted stream with delta times
  let lastTick = 0;
  for (const evt of events) {
    const delta = evt.tick - lastTick;
    trackBytes.push(...writeVLQ(delta));
    trackBytes.push(evt.type === 'on' ? 0x90 : 0x80, evt.midiNote, evt.velocity);
    lastTick = evt.tick;
  }

  // End-of-track
  trackBytes.push(...writeVLQ(Math.max(0, totalTicks - lastTick)));
  trackBytes.push(0xff, 0x2f, 0x00);

  // File header
  const header = [
    0x4d, 0x54, 0x68, 0x64,           // MThd
    ...writeUint32(6),                 // header length
    ...writeUint16(0),                 // format 0
    ...writeUint16(1),                 // 1 track
    ...writeUint16(TICKS_PER_QUARTER), // ticks per quarter note
  ];

  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,           // MTrk
    ...writeUint32(trackBytes.length),
  ];

  const file = new Uint8Array(header.length + trackHeader.length + trackBytes.length);
  file.set(header, 0);
  file.set(trackHeader, header.length);
  file.set(trackBytes, header.length + trackHeader.length);
  return file;
}

/**
 * Trigger a browser download of the MIDI file for the current config.
 */
export function downloadMidiFile(config: Config, filename?: string): void {
  const data = buildMidiFile(config);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `whitney-${config.scale}-${config.numNotes}notes.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
