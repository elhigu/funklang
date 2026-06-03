/** Human-readable byte size: raw bytes < 1 kB, else one-decimal kB. */
export function fmtBytes(n: number): string {
  const b = Math.round(n);
  if (b < 1024) return `${b} B`;
  return `${(b / 1024).toFixed(1)} kB`;
}
