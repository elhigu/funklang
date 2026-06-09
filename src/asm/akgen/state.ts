// AkGenState — mirrors the static fields of Aklang2Asm's Program class
// (Program.cs fields, lines 30-74). The TS port keeps these on a single
// object threaded through the framework + op generators.

export interface AkGenState {
  // mul→shift lookup tables (Main 78-93)
  mulRightShifts: Record<string, string>;
  mulLeftShifts: Record<string, string>;

  localLabel: string;

  // per-instrument parsed header lists (filled while emitting)
  instrumentName: string[];
  instrumentLength: string[];
  instrumentLengthInt: number[];
  instrumentRepeatOffset: string[];
  instrumentRepeatLength: string[];
  instrumentLoop: string[];

  sampleTotalLength: number;
  fineProgressLength: number;

  externalSampleLength: string[];
  externalSampleLengthInt: number[];
  externalSampleTotalLength: number;

  // instance allocators
  currentLargeBufferInstance: number;
  maxLargeBufferInstance: number;
  currentWordInstance: number;
  maxWordInstance: number;
  currentEnvDInstance: number;
  maxEnvdInstance: number;

  usedNoise: boolean;
  useProgress: boolean;
  useFineProgress: boolean;
}

export function newAkGenState(): AkGenState {
  const mulRightShifts: Record<string, string> = {
    '#64': '#1',
    '#32': '#2',
    '#16': '#3',
    '#8': '#4',
    '#4': '#5',
    '#2': '#6',
    '#1': '#7',
  };
  const mulLeftShifts: Record<string, string> = {
    '#256': '#8',
    '#128': '#7',
    '#64': '#6',
    '#32': '#5',
    '#16': '#4',
    '#8': '#3',
    '#4': '#2',
    '#2': '#1',
  };
  return {
    mulRightShifts,
    mulLeftShifts,
    localLabel: '',
    instrumentName: [],
    instrumentLength: [],
    instrumentLengthInt: [],
    instrumentRepeatOffset: [],
    instrumentRepeatLength: [],
    instrumentLoop: [],
    sampleTotalLength: 0,
    fineProgressLength: 0,
    externalSampleLength: [],
    externalSampleLengthInt: [],
    externalSampleTotalLength: 0,
    currentLargeBufferInstance: 0,
    maxLargeBufferInstance: 0,
    currentWordInstance: 0,
    maxWordInstance: 0,
    currentEnvDInstance: 0,
    maxEnvdInstance: 0,
    usedNoise: false,
    // The funklang harness always runs the oracle with `-pf`.
    useProgress: true,
    useFineProgress: true,
  };
}
