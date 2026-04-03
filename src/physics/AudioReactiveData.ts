// Lightweight audio-reactive data derived from note triggers.
// No FFT — uses MIDI note frequencies and trigger velocity/decay.

const MAX_ACTIVE = 64;
const NUM_EQ_BANDS = 32;
const MIDI_LOW = 21;
const MIDI_HIGH = 108;
const MIDI_RANGE = MIDI_HIGH - MIDI_LOW;
const MAX_TRIGGER_EVENTS = 64;

interface ActiveNote {
  frequency: number;
  amplitude: number;
}

export interface TriggerEventData {
  x: number;
  y: number;
  hue: number;
  birthTime: number;
}

export class AudioReactiveData {
  private notes: ActiveNote[] = [];
  decayRate = 3.0;
  peakFallRate = 0.8;

  // Summary values
  amplitude = 0;
  bass = 0;
  mid = 0;
  high = 0;

  // EQ bands
  bands = new Float32Array(NUM_EQ_BANDS);
  peaks = new Float32Array(NUM_EQ_BANDS);

  // Trigger event ring buffer (for shaders like Fireworks)
  triggerEvents: TriggerEventData[] = [];
  private prevTriggerAnim = new Float32Array(256);

  noteOn(midiNote: number, velocity: number): void {
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const amp = Math.max(0, Math.min(1, velocity));

    // Reuse slot with same frequency, or find quietest
    let slot = -1;
    let quietest = 999;
    let quietIdx = 0;

    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i]!.frequency === freq) { slot = i; break; }
      if (this.notes[i]!.amplitude < quietest) {
        quietest = this.notes[i]!.amplitude;
        quietIdx = i;
      }
    }

    if (slot >= 0) {
      this.notes[slot]!.amplitude = Math.max(this.notes[slot]!.amplitude, amp);
    } else if (this.notes.length < MAX_ACTIVE) {
      this.notes.push({ frequency: freq, amplitude: amp });
    } else {
      this.notes[quietIdx] = { frequency: freq, amplitude: amp };
    }
  }

  // Detect new triggers from dot states and record them in the ring buffer
  updateTriggerEvents(dotStates: { position: [number, number]; hue: number; triggerAnimation: number }[], currentTime: number): void {
    const numDots = Math.min(dotStates.length, 256);

    // Grow prevTriggerAnim if needed
    if (this.prevTriggerAnim.length < numDots) {
      this.prevTriggerAnim = new Float32Array(numDots);
    }

    for (let i = 0; i < numDots; i++) {
      const d = dotStates[i]!;
      const prev = this.prevTriggerAnim[i]!;

      // Detect rising edge: animation jumps above 0.9 from below 0.5
      if (d.triggerAnimation > 0.9 && prev < 0.5) {
        this.triggerEvents.push({
          x: d.position[0],
          y: d.position[1],
          hue: d.hue,
          birthTime: currentTime,
        });

        // Cap ring buffer
        if (this.triggerEvents.length > MAX_TRIGGER_EVENTS) {
          this.triggerEvents.shift();
        }
      }

      this.prevTriggerAnim[i] = d.triggerAnimation;
    }

    // Remove events older than 5 seconds
    this.triggerEvents = this.triggerEvents.filter(e => currentTime - e.birthTime < 5);
  }

  update(deltaTime: number): void {
    const decay = this.decayRate * deltaTime;
    let sumAll = 0, sumBass = 0, sumMid = 0, sumHigh = 0;

    // Clear bands
    this.bands.fill(0);

    let writeIdx = 0;
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      n.amplitude -= decay;
      if (n.amplitude <= 0) continue;

      sumAll += n.amplitude;
      if (n.frequency < 250) sumBass += n.amplitude;
      else if (n.frequency < 2000) sumMid += n.amplitude;
      else sumHigh += n.amplitude;

      // Bin into EQ band
      const midiVal = 69 + 12 * Math.log2(n.frequency / 440);
      const bandPos = (midiVal - MIDI_LOW) / MIDI_RANGE;
      const band = Math.max(0, Math.min(NUM_EQ_BANDS - 1, Math.floor(bandPos * NUM_EQ_BANDS)));
      this.bands[band] = Math.min(this.bands[band]! + n.amplitude, 1);

      if (writeIdx !== i) this.notes[writeIdx] = n;
      writeIdx++;
    }
    this.notes.length = writeIdx;

    this.amplitude = Math.min(sumAll, 1);
    this.bass = Math.min(sumBass, 1);
    this.mid = Math.min(sumMid, 1);
    this.high = Math.min(sumHigh, 1);

    // Peak hold
    const peakDrop = this.peakFallRate * deltaTime;
    for (let b = 0; b < NUM_EQ_BANDS; b++) {
      if (this.bands[b]! > this.peaks[b]!) {
        this.peaks[b] = this.bands[b]!;
      } else {
        this.peaks[b] = Math.max(this.peaks[b]! - peakDrop, 0);
      }
    }
  }
}
