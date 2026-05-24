import { describe, it, expect, vi } from 'vitest';
import { signal, effect } from '../../src/ui/reactive';

describe('signal/effect', () => {
  it('runs effect on initial subscribe and on every change', () => {
    const s = signal(0);
    const cb = vi.fn();
    effect(() => cb(s.get()));
    s.set(1); s.set(2);
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenLastCalledWith(2);
  });
  it('does not re-run when set to identical value (Object.is)', () => {
    const s = signal({a:1});
    const v = s.get();
    const cb = vi.fn();
    effect(() => { s.get(); cb(); });
    s.set(v);  // same reference
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
