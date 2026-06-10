import { describe, it, expect } from 'vitest';
import { createEditorState } from '../../src/ui/editor-state';

describe('createEditorState', () => {
  it('focuses instrument 0 with whole-instrument selection and output', () => {
    const s = createEditorState('C-3');
    expect(s.activeIdx).toBe(0);
    expect(s.selection).toEqual({ instrIdx: 0, slotIdx: null });
    expect(s.outputTarget).toEqual({ instrIdx: 0, slotIdx: null });
  });

  it('carries the supplied preview note and a blank file', () => {
    const s = createEditorState('A-4');
    expect(s.previewNote).toBe('A-4');
    expect(s.patchFileName).toBe('');
    expect(s.patchFileHandle).toBeUndefined();
  });

  it('returns independent selection / outputTarget objects per call', () => {
    const a = createEditorState('C-3');
    const b = createEditorState('C-3');
    a.selection.instrIdx = 5;
    expect(b.selection.instrIdx).toBe(0);          // not shared by reference
    expect(a.outputTarget).not.toBe(b.outputTarget);
  });
});
