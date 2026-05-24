// Note → playback-rate table for the preview audition dropdown.
//
// We don't try to be physically accurate to the Amiga Paula period — the
// editor just needs a reasonable preview rate per note. We anchor C-3 at
// 11025 Hz (a typical chiptune preview rate, half of the standard 22050)
// and step by equal-temperament semitones from there. C-4 lands at 22050,
// C-5 at 44100, etc.
//
// The list ranges from C-1 to B-5 — 5 octaves around middle C, covering
// the range chiptune samples are typically previewed in.

const C3_HZ = 11025;

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function buildNotes(): string[] {
  const out: string[] = [];
  for (let oct = 1; oct <= 5; oct++) {
    for (const n of NOTE_NAMES) out.push(`${n}${oct}`);
  }
  return out;
}

export const NOTE_LIST: ReadonlyArray<string> = buildNotes();
export const DEFAULT_NOTE = 'C-3';

/** Semitones from C-3 (positive = higher pitch). */
function semitonesFromC3(note: string): number {
  // note format: <letter><sharp?><octave>, e.g. "C-3" "C#3" "A-5"
  const head = note.slice(0, 2); // "C-" / "C#" / etc.
  const octStr = note.slice(2);
  const oct = parseInt(octStr, 10);
  if (!Number.isFinite(oct)) return 0;
  const idx = NOTE_NAMES.indexOf(head);
  if (idx < 0) return 0;
  return (oct - 3) * 12 + idx;
}

export function noteRateHz(note: string): number {
  return C3_HZ * Math.pow(2, semitonesFromC3(note) / 12);
}
