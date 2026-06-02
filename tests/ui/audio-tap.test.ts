import { describe, it, expect } from 'vitest';
import { emptyInstrument, emptySlot } from '../../src/patch/types';
import type { Instrument } from '../../src/patch/types';
import type { RenderResult } from '../../src/dsp/types';
import { buildFinalAudible, slotDisplayTap, audibleForTarget } from '../../src/ui/audio-tap';

// Minimal RenderResult: `bytes` (Int8) is the post-loopgen DAC truth;
// `slotTaps[i]` is each slot's per-tick Int16 output.
function render(bytes: number[], taps: number[][]): RenderResult {
  return {
    sample: new Int16Array(0),
    slotTaps: taps.map((t) => Int16Array.from(t)),
    bytes: Int8Array.from(bytes),
  };
}

function instr(opts: { slots: number[]; loopOffset?: number; loopLength?: number }): Instrument {
  const ins = emptyInstrument('x');
  ins.slots = opts.slots.map((fn) => ({ ...emptySlot(), fn, outVar: 1 }));
  ins.loopOffset = opts.loopOffset ?? 0;
  ins.loopLength = opts.loopLength ?? 0;
  return ins;
}

describe('buildFinalAudible', () => {
  it('one-shots (bytes<<8) when the instrument has no loop_gen', () => {
    const ins = instr({ slots: [2] });                       // osc_saw only
    const out = buildFinalAudible(ins, render([1, 2, -1], [[]]));
    expect(Array.from(out)).toEqual([256, 512, -256]);       // each byte << 8
  });

  it('appends the loop region when loop_gen (22) present AND loopLength > 0', () => {
    // bytes 1..6, loop region offset 2 len 2 → original + (bytes[2],bytes[3]) once.
    const ins = instr({ slots: [2, 22], loopOffset: 2, loopLength: 2 });
    const out = buildFinalAudible(ins, render([1, 2, 3, 4, 5, 6], [[], []]));
    // FINAL_LOOP_REPEATS = 1, so original 6 + 2 looped samples = 8.
    expect(out.length).toBe(8);
    expect(Array.from(out.subarray(6))).toEqual([768, 1024]);  // bytes 3,4 << 8
  });

  it('one-shots when loop_gen present but loopLength is 0', () => {
    const ins = instr({ slots: [2, 22], loopOffset: 0, loopLength: 0 });
    const out = buildFinalAudible(ins, render([1, 2], [[], []]));
    expect(out.length).toBe(2);
  });
});

describe('slotDisplayTap', () => {
  it('returns the slot\'s per-tick tap for an ordinary slot', () => {
    const ins = instr({ slots: [2, 1] });
    const out = slotDisplayTap(ins, render([9], [[10, 20], [30, 40]]), 1);
    expect(Array.from(out)).toEqual([30, 40]);
  });

  it('returns the post-loopgen bytes for a loop_gen slot', () => {
    const ins = instr({ slots: [2, 22] });
    const out = slotDisplayTap(ins, render([1, 2, 3], [[10], [0]]), 1);
    expect(Array.from(out)).toEqual([256, 512, 768]);        // bytes << 8
  });

  it('returns an empty array for an out-of-range slot index', () => {
    const ins = instr({ slots: [2] });
    expect(slotDisplayTap(ins, render([1], [[5]]), 9).length).toBe(0);
  });
});

describe('audibleForTarget', () => {
  it('slotIdx null → final audible (one-shot here)', () => {
    const ins = instr({ slots: [2] });
    const out = audibleForTarget(ins, render([1, 2], [[]]), null);
    expect(Array.from(out)).toEqual([256, 512]);
  });

  it('a loop_gen slot target → final audible (looped), not the silent tap', () => {
    const ins = instr({ slots: [2, 22], loopOffset: 2, loopLength: 2 });
    const out = audibleForTarget(ins, render([1, 2, 3, 4], [[], []]), 1);
    // loop_gen slot → buildFinalAudible → original 4 + 2 looped = 6.
    expect(out.length).toBe(6);
  });

  it('an ordinary slot target → that slot\'s one-shot tap', () => {
    const ins = instr({ slots: [2, 1] });
    const out = audibleForTarget(ins, render([9], [[1], [7, 8]]), 1);
    expect(Array.from(out)).toEqual([7, 8]);
  });
});
