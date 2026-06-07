import { emptyPatch, type Patch } from '../../src/patch/types';
import { opInstrument, CALIB_SAMPLE_LENGTH } from './op-instruments';
import { modesFor, modeId } from './modes';

/** OP_ARGS regular ops (bespoke 17/18/20/23, loop_gen 22, vocoder 24 excluded). */
export const REGULAR_OPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 21];

export interface PhaseDesc { op: number; mode: string; }
export interface CorpusItem {
  id: string;
  patch: Patch;
  measured: PhaseDesc[];
  producerCount: number;
  importBytes: number;
  note?: string;
}

function single(instr: ReturnType<typeof opInstrument>['instrument']): Patch {
  const p = emptyPatch();
  p.instruments[0] = instr;
  return p;
}

export function buildCorpus(): CorpusItem[] {
  const items: CorpusItem[] = [];

  // 1) producer-only: one sine phase.
  {
    const { instrument, producerCount } = opInstrument(4, [false, false], 'producer');
    items.push({ id: 'producer', patch: single(instrument), measured: [{ op: 4, mode: 'cc' }], producerCount, importBytes: 0 });
  }

  // 2) per-op-per-mode single-instrument items.
  for (const op of REGULAR_OPS) {
    for (const mode of modesFor(op)) {
      const mid = modeId(mode);
      const { instrument, producerCount } = opInstrument(op, mode);
      items.push({ id: `op${op}_${mid}`, patch: single(instrument), measured: [{ op, mode: mid }], producerCount, importBytes: 0 });
    }
  }

  // 3) scaffold: every regular op once (const), one per instrument.
  {
    const p = emptyPatch();
    const measured: PhaseDesc[] = [];
    let producers = 0;
    REGULAR_OPS.forEach((op, idx) => {
      const constMode = modesFor(op)[0]!;
      const { instrument, producerCount } = opInstrument(op, constMode, `s${op}`);
      p.instruments[idx] = instrument;
      measured.push({ op, mode: modeId(constMode) });
      producers += producerCount;
    });
    items.push({ id: 'scaffold', patch: p, measured, producerCount: producers, importBytes: 0 });
  }

  // 4) two-phase: a few ops used twice in ONE instrument.
  for (const op of [2, 7, 12, 15]) {
    const a = opInstrument(op, modesFor(op)[0]!, `two${op}`);
    const b = opInstrument(op, modesFor(op)[0]!);
    const instrument = a.instrument;
    instrument.slots = [...a.instrument.slots, ...b.instrument.slots];
    const mid = modeId(modesFor(op)[0]!);
    items.push({
      id: `twophase_op${op}`, patch: single(instrument),
      measured: [{ op, mode: mid }, { op, mode: mid }],
      producerCount: a.producerCount + b.producerCount, importBytes: 0,
    });
  }

  // 5) imports.
  for (const bytes of [256, 4096, 32768]) {
    const { instrument } = opInstrument(2, [false, false], 'imp');
    const p = single(instrument);
    p.importedSamples[0]!.data = Int8Array.from(Array.from({ length: bytes }, (_, i) => (i % 251) - 125));
    items.push({ id: `imports_${bytes}`, patch: p, measured: [{ op: 2, mode: 'cc' }], producerCount: 0, importBytes: bytes });
  }

  // 6) sample-length neutrality.
  for (const len of [4, CALIB_SAMPLE_LENGTH, 131070]) {
    const { instrument } = opInstrument(2, [false, false], 'len');
    instrument.sampleLength = len;
    items.push({ id: `samplelen_${len}`, patch: single(instrument), measured: [{ op: 2, mode: 'cc' }], producerCount: 0, importBytes: 0 });
  }

  return items;
}
