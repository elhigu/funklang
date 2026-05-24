type Reader = () => void;
let CURRENT: Reader | null = null;

export interface Signal<T> { get(): T; set(v: T): void; }

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subs = new Set<Reader>();
  return {
    get() { if (CURRENT) subs.add(CURRENT); return value; },
    set(v: T) {
      if (Object.is(v, value)) return;
      value = v;
      for (const r of [...subs]) r();
    },
  };
}

export function effect(fn: () => void): () => void {
  const run: Reader = () => { CURRENT = run; try { fn(); } finally { CURRENT = null; } };
  run();
  return () => { /* simple version: no GC; lifetime tied to caller */ };
}
