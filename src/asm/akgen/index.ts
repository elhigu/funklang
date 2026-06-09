// emitAkGenerate(patch) — TypeScript port of Aklang2Asm's Main.
//
// We build the oracle's input (the dan-script) with the shipped emitDanScript,
// then parse it EXACTLY as Main does (Program.cs 131-227) so framework state is
// derived identically, then run the framework + op dispatch.

import type { Patch } from '../../patch/types';
import { emitDanScript } from '../../codegen/emit-inst';
import { newAkGenState } from './state';
import { emitFramework, type ParsedInstrument } from './framework';
import { dispatchOp } from './ops';

export function emitAkGenerate(patch: Patch): string {
  const script = emitDanScript(patch);
  const st = newAkGenState();

  // Main 131-143: split on '$'; first element is the imports line.
  const list = script.split('$');
  const importsRaw = list.shift()!;
  const importsClean = importsRaw.replace(/\r/g, '').replace(/\n/g, '').replace(/ /g, '');
  for (const piece of importsClean.split(',')) {
    st.externalSampleLength.push(piece);
    const num = parseInt(piece, 10);
    st.externalSampleLengthInt.push(num);
    st.externalSampleTotalLength += num;
  }

  // Main 212-234: parse each instrument segment.
  const parsed: ParsedInstrument[] = [];
  for (let j = 0; j < list.length; j++) {
    const seg = list[j]!.replace(/\r/g, '').replace(/\n/g, '');
    const onHash = seg.split('#');
    const headerStr = onHash[0]!.replace(/ /g, '');
    const header = headerStr.split(',');
    let statements = onHash[1]!.split(';');
    // Remove empty statements (Main 228-234).
    statements = statements.filter((s) => s.length > 0);
    parsed.push({ header, statements });
  }

  return emitFramework(st, parsed, (state, stmt) => {
    // Re-derive output + inputs exactly as Main 287-290.
    const output = stmt.substring(0, 2);
    const open = stmt.indexOf('(') + 1;
    const close = stmt.indexOf(')');
    const inputs = stmt.substring(open, close).replace(/ /g, '').split(',');
    return dispatchOp(state, stmt, output, inputs);
  });
}
