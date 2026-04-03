import { getInstrument } from './InstrumentLibrary.js';
import { midiToFileName } from '../music/ScaleSystem.js';

const NUM_VELOCITY_LAYERS = 5;
const VELOCITY_VALUES = [24, 48, 72, 96, 116];
const MAX_VOICES = 64;

interface Voice {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  midiNote: number;
  startTime: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private voices: Voice[] = [];

  // Sample storage: midiNote → velocity layer index → AudioBuffer
  private samples = new Map<number, (AudioBuffer | null)[]>();
  private loadedCount = 0;
  private totalToLoad = 0;
  private loading = false;
  private cancelToken = { cancelled: false };

  private currentInstrumentKey = '';
  private volume = 0.5;
  private enabled = true;

  getLoadProgress(): number {
    return this.totalToLoad > 0 ? this.loadedCount / this.totalToLoad : 1;
  }
  isLoading(): boolean { return this.loading; }

  // Must be called from a user gesture (click/keypress) to satisfy autoplay policy
  async ensureContext(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }

    this.ctx = new AudioContext({ sampleRate: 44100 });

    // Soft limiter via compressor (approximates tanh saturation)
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.05;
    this.limiter.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.limiter);

    // Pre-create voice gain nodes
    for (let i = 0; i < MAX_VOICES; i++) {
      const gain = this.ctx.createGain();
      gain.connect(this.masterGain);
      this.voices.push({ source: null, gain, midiNote: -1, startTime: 0 });
    }
  }

  async switchInstrument(instrumentKey: string, lowMidi: number, highMidi: number): Promise<void> {
    if (instrumentKey === this.currentInstrumentKey) return;

    // Cancel any in-progress load
    this.cancelToken.cancelled = true;
    this.cancelToken = { cancelled: false };
    const token = this.cancelToken;

    this.killAllVoices();
    this.samples.clear();
    this.currentInstrumentKey = instrumentKey;
    this.loading = true;
    this.loadedCount = 0;

    const inst = getInstrument(instrumentKey);
    const effectiveLow = Math.max(lowMidi, inst.midiLow);
    const effectiveHigh = Math.min(highMidi, inst.midiHigh);

    // Phase 1: load middle velocity layer (v072) for all notes
    const notesToLoad: number[] = [];
    for (let midi = effectiveLow; midi <= effectiveHigh; midi++) {
      notesToLoad.push(midi);
      // Pre-allocate sample slots
      this.samples.set(midi, new Array(NUM_VELOCITY_LAYERS).fill(null));
    }

    this.totalToLoad = notesToLoad.length; // Phase 1 count
    const middleLayer = 2; // index of v072

    // Load phase 1 (mezzo-forte layer — enables immediate playback)
    await this.loadLayer(inst.folderName, notesToLoad, middleLayer, token);

    if (token.cancelled) return;

    // Phase 2: load remaining velocity layers in background
    this.totalToLoad = notesToLoad.length * NUM_VELOCITY_LAYERS;
    this.loadedCount = notesToLoad.length; // Phase 1 already done

    for (let layer = 0; layer < NUM_VELOCITY_LAYERS; layer++) {
      if (layer === middleLayer) continue;
      if (token.cancelled) return;
      await this.loadLayer(inst.folderName, notesToLoad, layer, token);
    }

    this.loading = false;
  }

  private async loadLayer(
    folderName: string, notes: number[], layerIdx: number,
    token: { cancelled: boolean },
  ): Promise<void> {
    // Load in small batches to avoid overwhelming the network
    const batchSize = 8;
    for (let i = 0; i < notes.length; i += batchSize) {
      if (token.cancelled) return;
      const batch = notes.slice(i, i + batchSize);
      await Promise.all(batch.map(midi => this.loadSample(folderName, midi, layerIdx, token)));
    }
  }

  private async loadSample(
    folderName: string, midiNote: number, layerIdx: number,
    token: { cancelled: boolean },
  ): Promise<void> {
    if (token.cancelled) return;

    const fileName = midiToFileName(midiNote);
    const velCode = VELOCITY_VALUES[layerIdx]!.toString().padStart(3, '0');
    const url = `/instruments/${folderName}/${fileName}_v${velCode}.mp3`;

    try {
      const response = await fetch(url);
      if (!response.ok) return; // Missing samples are normal (sparse instruments)
      if (token.cancelled) return;

      const arrayBuffer = await response.arrayBuffer();
      if (token.cancelled) return;

      const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
      if (token.cancelled) return;

      const layers = this.samples.get(midiNote);
      if (layers) {
        layers[layerIdx] = audioBuffer;
      }
    } catch {
      // Missing file or decode error — skip silently
    }

    this.loadedCount++;
  }

  playNoteByMidi(midiNote: number, velocity: number): void {
    if (!this.ctx || !this.enabled) return;

    const buffer = this.getSample(midiNote, velocity);
    if (!buffer) return;

    // Same-note cutoff: stop any voice playing this note
    for (const voice of this.voices) {
      if (voice.midiNote === midiNote && voice.source) {
        try { voice.source.stop(); } catch { /* already stopped */ }
        voice.source = null;
        voice.midiNote = -1;
      }
    }

    // Find free voice (or steal oldest)
    const voice = this.findVoice();

    // Stop existing source if stealing
    if (voice.source) {
      try { voice.source.stop(); } catch { /* ok */ }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(voice.gain);

    // Fade-in to prevent clicks (~1.5ms)
    voice.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    voice.gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.0015);

    source.onended = () => {
      if (voice.source === source) {
        voice.source = null;
        voice.midiNote = -1;
      }
    };

    voice.source = source;
    voice.midiNote = midiNote;
    voice.startTime = this.ctx.currentTime;
    source.start();
  }

  private getSample(midiNote: number, velocity: number): AudioBuffer | null {
    const layers = this.samples.get(midiNote);
    if (!layers) {
      // Try nearest note within ±3 semitones (sparse instrument fallback)
      for (let offset = 1; offset <= 3; offset++) {
        const up = this.samples.get(midiNote + offset);
        if (up) { return this.pickLayer(up, velocity); }
        const down = this.samples.get(midiNote - offset);
        if (down) { return this.pickLayer(down, velocity); }
      }
      return null;
    }
    return this.pickLayer(layers, velocity);
  }

  private pickLayer(layers: (AudioBuffer | null)[], velocity: number): AudioBuffer | null {
    // Map velocity (0-1) to nearest velocity layer
    const midiVel = Math.round(velocity * 127);
    let bestIdx = 2; // default to middle (v072)
    let bestDist = 999;
    for (let i = 0; i < NUM_VELOCITY_LAYERS; i++) {
      if (!layers[i]) continue;
      const dist = Math.abs(midiVel - VELOCITY_VALUES[i]!);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return layers[bestIdx] ?? layers[2] ?? layers.find(l => l !== null) ?? null;
  }

  private findVoice(): Voice {
    // Find inactive voice
    for (const v of this.voices) {
      if (!v.source) return v;
    }
    // Steal oldest voice
    let oldest = this.voices[0]!;
    for (const v of this.voices) {
      if (v.startTime < oldest.startTime) oldest = v;
    }
    return oldest;
  }

  setVolume(vol: number): void {
    this.volume = vol;
    if (this.masterGain) {
      this.masterGain.gain.value = vol;
    }
  }

  setEnabled(e: boolean): void { this.enabled = e; }

  killAllVoices(): void {
    for (const voice of this.voices) {
      if (voice.source) {
        try { voice.source.stop(); } catch { /* ok */ }
        voice.source = null;
        voice.midiNote = -1;
      }
    }
  }
}
