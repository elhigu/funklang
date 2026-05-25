import { describe, it, expect } from 'vitest';
import { NOTE_LIST, DEFAULT_NOTE, noteRateHz } from '../../src/ui/note-table';

describe('note-table (Klang-matching)', () => {
  it('exposes 3 octaves × 12 notes = 36 entries (C-1..B-3)', () => {
    expect(NOTE_LIST.length).toBe(3 * 12);
    expect(NOTE_LIST[0]).toBe('C-1');
    expect(NOTE_LIST[NOTE_LIST.length - 1]).toBe('B-3');
  });

  it('default is C-3 (Klang octave-3 C)', () => {
    expect(DEFAULT_NOTE).toBe('C-3');
    expect(NOTE_LIST).toContain(DEFAULT_NOTE);
  });

  it("C-3 maps to Klang's 7093789.2/856*2 ≈ 16574 Hz", () => {
    expect(noteRateHz('C-3')).toBeCloseTo(16574, 0);
  });

  it('C-2 is one octave below C-3 (rate / 2)', () => {
    // Within 1 Hz of half (rounding may shift by 0.5).
    expect(Math.abs(noteRateHz('C-2') - noteRateHz('C-3') / 2)).toBeLessThanOrEqual(1);
  });

  it('C-1 is two octaves below C-3 (rate / 4)', () => {
    expect(Math.abs(noteRateHz('C-1') - noteRateHz('C-3') / 4)).toBeLessThanOrEqual(1);
  });

  it('C#3 is one semitone above C-3 (approx 2^(1/12) ratio)', () => {
    const ratio = noteRateHz('C#3') / noteRateHz('C-3');
    // Klang uses integer Paula periods, so the ratio is "close to" 2^(1/12)
    // but not exact. Period 856 vs 808 → 1.05941, semitone = 1.05946.
    expect(ratio).toBeCloseTo(Math.pow(2, 1 / 12), 3);
  });

  it("matches Klang's full octave-3 period table", () => {
    // From Form1.calcsamplerate in the decompile.
    const expected: Array<[string, number]> = [
      ['C-3', 856], ['C#3', 808], ['D-3', 762], ['D#3', 720],
      ['E-3', 678], ['F-3', 640], ['F#3', 604], ['G-3', 570],
      ['G#3', 538], ['A-3', 508], ['A#3', 480], ['B-3', 453],
    ];
    for (const [name, period] of expected) {
      const expectedHz = Math.round((7093789.2 / period) * 2);
      expect(noteRateHz(name)).toBe(expectedHz);
    }
  });
});
