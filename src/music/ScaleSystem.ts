export interface ScaleDefinition {
  name: string;
  displayName: string;
  category: string;
  intervals: number[];
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FILE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'] as const;

const scales: ScaleDefinition[] = [
  // Chromatic & Symmetric
  { name: 'augmented',    displayName: 'Augmented',        category: 'Chromatic & Symmetric', intervals: [0,3,4,7,8,11] },
  { name: 'chromatic',    displayName: 'Chromatic',         category: 'Chromatic & Symmetric', intervals: [0,1,2,3,4,5,6,7,8,9,10,11] },
  { name: 'diminished',   displayName: 'Diminished',        category: 'Chromatic & Symmetric', intervals: [0,2,3,5,6,8,9,11] },
  { name: 'messiaen3',    displayName: 'Messiaen Mode 3',   category: 'Chromatic & Symmetric', intervals: [0,2,3,4,6,7,8,10,11] },
  { name: 'messiaen5',    displayName: 'Messiaen Mode 5',   category: 'Chromatic & Symmetric', intervals: [0,1,5,6,7,11] },
  { name: 'wholeTone',    displayName: 'Whole Tone',        category: 'Chromatic & Symmetric', intervals: [0,2,4,6,8,10] },
  // Exotic
  { name: 'byzantine',    displayName: 'Byzantine',         category: 'Exotic', intervals: [0,1,4,5,7,8,11] },
  { name: 'enigmatic',    displayName: 'Enigmatic',         category: 'Exotic', intervals: [0,1,4,6,8,10,11] },
  { name: 'hindu',        displayName: 'Hindu',             category: 'Exotic', intervals: [0,2,4,5,7,8,10] },
  { name: 'neapolitan',   displayName: 'Neapolitan',        category: 'Exotic', intervals: [0,1,3,5,7,9,11] },
  { name: 'persian',      displayName: 'Persian',           category: 'Exotic', intervals: [0,1,4,5,6,8,11] },
  { name: 'tritone',      displayName: 'Tritone',           category: 'Exotic', intervals: [0,1,4,6,7,10] },
  // Major Scales
  { name: 'lydian',       displayName: 'Lydian',            category: 'Major Scales', intervals: [0,2,4,6,7,9,11] },
  { name: 'major',        displayName: 'Major',             category: 'Major Scales', intervals: [0,2,4,5,7,9,11] },
  { name: 'mixolydian',   displayName: 'Mixolydian',        category: 'Major Scales', intervals: [0,2,4,5,7,9,10] },
  // Minor Scales
  { name: 'dorian',       displayName: 'Dorian',            category: 'Minor Scales', intervals: [0,2,3,5,7,9,10] },
  { name: 'harmonicMinor',displayName: 'Harmonic Minor',    category: 'Minor Scales', intervals: [0,2,3,5,7,8,11] },
  { name: 'locrian',      displayName: 'Locrian',           category: 'Minor Scales', intervals: [0,1,3,5,6,8,10] },
  { name: 'melodicMinor', displayName: 'Melodic Minor',     category: 'Minor Scales', intervals: [0,2,3,5,7,9,11] },
  { name: 'minor',        displayName: 'Minor',             category: 'Minor Scales', intervals: [0,2,3,5,7,8,10] },
  { name: 'phrygian',     displayName: 'Phrygian',          category: 'Minor Scales', intervals: [0,1,3,5,7,8,10] },
  { name: 'phrygianDominant', displayName: 'Phrygian Dominant', category: 'Minor Scales', intervals: [0,1,4,5,7,8,10] },
  // Pentatonic
  { name: 'balinesePelog', displayName: 'Balinese Pelog',   category: 'Pentatonic', intervals: [0,1,3,7,8] },
  { name: 'chinese',      displayName: 'Chinese',           category: 'Pentatonic', intervals: [0,4,6,7,11] },
  { name: 'egyptian',     displayName: 'Egyptian',          category: 'Pentatonic', intervals: [0,2,5,7,10] },
  { name: 'japanese',     displayName: 'Japanese',          category: 'Pentatonic', intervals: [0,1,5,7,8] },
  { name: 'kumoi',        displayName: 'Kumoi',             category: 'Pentatonic', intervals: [0,2,3,7,9] },
  { name: 'majorPentatonic', displayName: 'Major Pentatonic', category: 'Pentatonic', intervals: [0,2,4,7,9] },
  { name: 'minorPentatonic', displayName: 'Minor Pentatonic', category: 'Pentatonic', intervals: [0,3,5,7,10] },
  { name: 'yo',           displayName: 'Yo',                category: 'Pentatonic', intervals: [0,2,5,7,9] },
  // World Scales
  { name: 'arabic',       displayName: 'Arabic',            category: 'World Scales', intervals: [0,1,4,5,7,8,11] },
  { name: 'bebop',        displayName: 'Bebop',             category: 'World Scales', intervals: [0,2,4,5,7,9,10,11] },
  { name: 'blues',        displayName: 'Blues',              category: 'World Scales', intervals: [0,3,5,6,7,10] },
  { name: 'hirajoshi',    displayName: 'Hirajoshi',         category: 'World Scales', intervals: [0,2,3,7,8] },
  { name: 'hungarian',    displayName: 'Hungarian',         category: 'World Scales', intervals: [0,2,3,6,7,8,11] },
  { name: 'iwato',        displayName: 'Iwato',             category: 'World Scales', intervals: [0,1,5,6,10] },
  { name: 'prometheus',   displayName: 'Prometheus',        category: 'World Scales', intervals: [0,2,4,6,9,10] },
  { name: 'romanian',     displayName: 'Romanian',          category: 'World Scales', intervals: [0,2,3,6,7,9,10] },
  { name: 'spanish',      displayName: 'Spanish',           category: 'World Scales', intervals: [0,1,4,5,7,8,10] },
];

const scaleMap = new Map<string, ScaleDefinition>();
for (const s of scales) scaleMap.set(s.name, s);

const defaultScale: ScaleDefinition = { name: 'chromatic', displayName: 'Chromatic', category: 'Chromatic & Symmetric', intervals: [0,1,2,3,4,5,6,7,8,9,10,11] };

export function getAllScales(): ScaleDefinition[] {
  return scales;
}

export function getScale(name: string): ScaleDefinition {
  return scaleMap.get(name) ?? defaultScale;
}

export function getMidiNoteForDot(dotIndex: number, scaleName: string, lowMidi: number, highMidi: number): number {
  const scale = getScale(scaleName);
  const total = countNotesInRange(scaleName, lowMidi, highMidi);
  if (total <= 0) return lowMidi;
  // Wrap dot index so extra dots cycle through available notes
  const wrappedIndex = dotIndex % total;
  const len = scale.intervals.length;
  const octaveOffset = Math.floor(wrappedIndex / len);
  const degree = wrappedIndex % len;
  return lowMidi + scale.intervals[degree]! + octaveOffset * 12;
}

export function countNotesInRange(scaleName: string, lowMidi: number, highMidi: number): number {
  const scale = getScale(scaleName);
  let count = 0;
  for (let noteIndex = 0; ; noteIndex++) {
    const octaveOffset = Math.floor(noteIndex / scale.intervals.length);
    const degree = noteIndex % scale.intervals.length;
    const midiNote = lowMidi + scale.intervals[degree]! + octaveOffset * 12;
    if (midiNote > highMidi) break;
    count++;
  }
  return count;
}

export function midiToNoteName(midiNote: number): string {
  const noteInOctave = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  return NOTE_NAMES[noteInOctave] + octave;
}

export function midiToFileName(midiNote: number): string {
  const noteInOctave = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  return FILE_NAMES[noteInOctave] + octave;
}

export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}
