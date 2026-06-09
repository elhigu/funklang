// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { assembleM68k } from '../../src/asm/vasm';

describe('assembleM68k (vasm WASM)', () => {
  it('assembles m68k Motorola syntax to raw bytes', async () => {
    const r = await assembleM68k('\tmoveq\t#1,d0\n\tadd.l\td1,d0\n\trts\n');
    expect(r.ok).toBe(true);
    expect([...r.bytes!]).toEqual([0x70, 0x01, 0xd0, 0x81, 0x4e, 0x75]);
  });

  it('reports an assembly error for bad source', async () => {
    const r = await assembleM68k('\tthis_is_not_an_opcode\n');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
