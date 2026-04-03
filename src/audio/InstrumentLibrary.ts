export interface InstrumentInfo {
  key: string;
  displayName: string;
  folderName: string;
  midiLow: number;
  midiHigh: number;
}

// Hardcoded instrument list — matches bin/data/instruments/*/instrument.toml
// In production, this could be generated at build time from the TOML files.
const INSTRUMENTS: InstrumentInfo[] = [
  { key: 'piano',       displayName: 'Piano',              folderName: 'Piano',       midiLow: 21, midiHigh: 108 },
];

const instrumentMap = new Map<string, InstrumentInfo>();
for (const inst of INSTRUMENTS) instrumentMap.set(inst.key, inst);

export function getAllInstruments(): InstrumentInfo[] {
  return INSTRUMENTS;
}

export function getInstrument(key: string): InstrumentInfo {
  return instrumentMap.get(key) ?? INSTRUMENTS[0]!;
}

export function getNextInstrument(currentKey: string): InstrumentInfo {
  const idx = INSTRUMENTS.findIndex(i => i.key === currentKey);
  return INSTRUMENTS[(idx + 1) % INSTRUMENTS.length]!;
}
