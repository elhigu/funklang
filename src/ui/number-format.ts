// Global display-mode toggle (hex vs. decimal) and helpers to render
// numeric values consistently across the editor. The mode is a process-
// wide singleton: every knob, every dropdown, every meta field reads
// from the same source so toggling once flips everything at once.

export type DisplayBase = 'dec' | 'hex';

let currentBase: DisplayBase = 'dec';
const listeners = new Set<() => void>();

export function getDisplayBase(): DisplayBase { return currentBase; }
export function setDisplayBase(b: DisplayBase): void {
  if (b === currentBase) return;
  currentBase = b;
  for (const l of listeners) l();
}
export function onDisplayBaseChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Format an integer using the current display base. Negative-safe. */
export function formatInt(n: number): string {
  if (currentBase === 'hex') {
    return n < 0 ? `-0x${(-n).toString(16).toUpperCase()}` : `0x${n.toString(16).toUpperCase()}`;
  }
  return String(n);
}

/**
 * Parse a number that may be prefixed `0x` (hex) — accepted regardless
 * of the current base, so the user can paste hex into a dec field. Falls
 * back to decimal `parseInt` otherwise.
 *
 * Returns NaN when the input doesn't look like a number at all.
 */
export function parseFlexInt(text: string): number {
  const t = text.trim();
  if (t === '') return NaN;
  // Match optional sign + 0x prefix + hex digits.
  const m = /^([+-]?)0x([0-9a-fA-F]+)$/.exec(t);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    return sign * parseInt(m[2]!, 16);
  }
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : NaN;
}
