import type { Patch } from '../../src/patch/types';
import { emitIlen } from './emit-ilen';
import { emitInst } from './emit-inst';
import { emitIset, emitIswitch } from './emit-iset';
import { emitIsamp } from './emit-isamp';
import { minimalMod } from './minimal-mod';
import { patchMod } from './emit-mod';

export interface ExportedArtifacts {
  'ilen.h': string;
  'inst.h': string;
  'Iset.h': string;
  'support/Iswitch.h': string;
  'Isamp.raw': Uint8Array;
  'empty.mod': Uint8Array;
}

export function exportPatch(patch: Patch): ExportedArtifacts {
  return {
    'ilen.h': emitIlen(patch),
    'inst.h': emitInst(patch),
    'Iset.h': emitIset(patch),
    'support/Iswitch.h': emitIswitch(),
    'Isamp.raw': emitIsamp(patch),
    'empty.mod': patchMod(minimalMod(), patch),
  };
}
