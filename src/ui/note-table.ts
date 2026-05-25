// Note → playback-rate table for the preview audition dropdown.
//
// Mirrors the original AmigaKlang GUI exactly: 12 notes × 3 octaves with
// Paula PAL periods, where the per-octave rate is computed from
//
//     samplerate = 7093789.2 / period * 2
//
// and octaves 2 / 1 halve / quarter the octave-3 rate respectively.
// (See Form1.calcsamplerate in the decompile, lines 1050-1105.)
//
// Klang only ships 3 octaves and labels them just "C" with a separate
// "Octave 1/2/3" radio group. We surface the cross-product as "C-1" ..
// "B-3" so the dropdown is a single flat list, but the rates are the
// same so a patch auditioned at "C-3" in funklang sounds identical to
// "C, Octave 3" in the original.

/** Period table for octave 3 — matches Form1.calcsamplerate switch indices. */
const PAL_PERIOD_OCT3: ReadonlyArray<{ name: string; period: number }> = [
  { name: 'C-',  period: 856 },
  { name: 'C#',  period: 808 },
  { name: 'D-',  period: 762 },
  { name: 'D#',  period: 720 },
  { name: 'E-',  period: 678 },
  { name: 'F-',  period: 640 },
  { name: 'F#',  period: 604 },
  { name: 'G-',  period: 570 },
  { name: 'G#',  period: 538 },
  { name: 'A-',  period: 508 },
  { name: 'A#',  period: 480 },
  { name: 'B-',  period: 453 },
];

const PAL_CLOCK = 7093789.2;

function oct3RateForPeriod(period: number): number {
  return Math.round((PAL_CLOCK / period) * 2);
}

function buildNotes(): string[] {
  const out: string[] = [];
  for (let oct = 1; oct <= 3; oct++) {
    for (const n of PAL_PERIOD_OCT3) out.push(`${n.name}${oct}`);
  }
  return out;
}

export const NOTE_LIST: ReadonlyArray<string> = buildNotes();
export const DEFAULT_NOTE = 'C-3';

/** Klang's rate for a `<note>-<octave>` label. */
export function noteRateHz(note: string): number {
  const head = note.slice(0, 2);
  const octStr = note.slice(2);
  const oct = parseInt(octStr, 10);
  const entry = PAL_PERIOD_OCT3.find((e) => e.name === head);
  if (!entry || !Number.isFinite(oct)) return oct3RateForPeriod(856);  // fallback: C-3
  const base = oct3RateForPeriod(entry.period);
  // Octave 1 = base / 4, octave 2 = base / 2, octave 3 = base.
  if (oct === 1) return Math.round(base / 4);
  if (oct === 2) return Math.round(base / 2);
  return base;
}
