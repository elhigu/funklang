// funklang/sizelab/exporter/loop-norm.ts
// Mirrors Form1.cs checkloopparams() (1400-1410): the GUI clamps loop offset to
// at least floor(sampleLength/2)-1 on load, then length = sampleLength - offset.
export function normalizeLoop(sampleLength: number, loopOffset: number): { off: number; len: number } {
  const sl = Math.max(0, sampleLength | 0);
  const half = Math.floor(sl / 2);
  const off = (loopOffset | 0) < half ? half - 1 : (loopOffset | 0);
  return { off, len: sl - off };
}
