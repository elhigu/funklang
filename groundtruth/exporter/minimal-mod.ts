// Smallest valid ProTracker M.K. module: 1084-byte header + one empty
// 1024-byte pattern. All silence. nPatterns = 1.
export const MOD_LENGTH_EMPTY = 1084 + 1024; // 2108

export function minimalMod(): Uint8Array {
  const m = new Uint8Array(MOD_LENGTH_EMPTY); // zero-filled: title, 31 sample headers, order table
  m[950] = 1;    // song length (1 position)
  m[951] = 127;  // restart byte (ProTracker default)
  m[1080] = 0x4d; m[1081] = 0x2e; m[1082] = 0x4b; m[1083] = 0x2e; // "M.K."
  // sample headers (offset 20 + 30*n): length/finetune/volume left 0 — patched per-instrument later.
  // one empty pattern (1084..2107) stays all-zero.
  return m;
}
