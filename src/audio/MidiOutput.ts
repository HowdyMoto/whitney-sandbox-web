const NOTE_OFF_DELAY = 300; // ms — how long to hold each note

export class MidiOutput {
  private access: MIDIAccess | null = null;
  private output: MIDIOutput | null = null;
  private enabled = false;
  private supported = false;

  constructor() {
    this.supported = typeof navigator.requestMIDIAccess === 'function';
  }

  isSupported(): boolean { return this.supported; }
  isEnabled(): boolean { return this.enabled; }
  getOutputName(): string { return this.output?.name ?? 'None'; }

  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    if (this.access) {
      this.enabled = true;
      return true;
    }
    try {
      this.access = await navigator.requestMIDIAccess();
      this.pickFirstOutput();
      this.access.addEventListener('statechange', () => this.pickFirstOutput());
      this.enabled = true;
      return true;
    } catch {
      this.supported = false;
      return false;
    }
  }

  disable(): void {
    this.enabled = false;
  }

  getOutputs(): { id: string; name: string }[] {
    if (!this.access) return [];
    const list: { id: string; name: string }[] = [];
    for (const [id, port] of this.access.outputs) {
      list.push({ id, name: port.name ?? id });
    }
    return list;
  }

  selectOutput(id: string): void {
    if (!this.access) return;
    this.output = this.access.outputs.get(id) ?? null;
  }

  sendNoteOn(midiNote: number, velocity: number, channel = 0): void {
    if (!this.enabled || !this.output) return;
    const status = 0x90 | (channel & 0x0F);
    const vel = Math.max(0, Math.min(127, Math.round(velocity)));
    this.output.send([status, midiNote, vel]);

    // Auto note-off
    setTimeout(() => {
      this.sendNoteOff(midiNote, channel);
    }, NOTE_OFF_DELAY);
  }

  sendNoteOff(midiNote: number, channel = 0): void {
    if (!this.output) return;
    const status = 0x80 | (channel & 0x0F);
    this.output.send([status, midiNote, 0]);
  }

  private pickFirstOutput(): void {
    if (!this.access) return;
    if (this.output) {
      // Check if current output is still connected
      if (this.access.outputs.has(this.output.id)) return;
    }
    // Pick first available
    for (const [, port] of this.access.outputs) {
      this.output = port;
      return;
    }
    this.output = null;
  }
}
