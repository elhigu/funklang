import { describe, it, expect } from 'vitest';
import { NOTE_LIST, DEFAULT_NOTE, noteRateHz } from '../../src/ui/note-table';

describe('note-table', () => {
  it('exposes a 5-octave (C-1..B-5) list of 60 entries', () => {
    expect(NOTE_LIST.length).toBe(5 * 12);
    expect(NOTE_LIST[0]).toBe('C-1');
    expect(NOTE_LIST[NOTE_LIST.length - 1]).toBe('B-5');
  });

  it('default is C-3', () => {
    expect(DEFAULT_NOTE).toBe('C-3');
    expect(NOTE_LIST).toContain(DEFAULT_NOTE);
  });

  it('C-3 maps to 11025 Hz', () => {
    expect(noteRateHz('C-3')).toBeCloseTo(11025, 1);
  });

  it('C-4 is one octave (2x) above C-3', () => {
    expect(noteRateHz('C-4') / noteRateHz('C-3')).toBeCloseTo(2, 4);
  });

  it('C#3 is one semitone above C-3', () => {
    expect(noteRateHz('C#3') / noteRateHz('C-3')).toBeCloseTo(Math.pow(2, 1 / 12), 4);
  });

  it('B-5 is just below C-6 (one octave + 11 semitones above C-4)', () => {
    expect(noteRateHz('B-5') / noteRateHz('C-3')).toBeCloseTo(Math.pow(2, 35 / 12), 4);
  });
});
