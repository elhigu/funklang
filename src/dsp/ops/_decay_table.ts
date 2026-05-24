// decayTable — verbatim copy of `static short decayTable[128]` from
// exe_creator/main-binary.c lines 12-21 (also replicated in
// main-executable.c line 47 and funklang/tools/refrender/refrender.c).
//
// Used by op 7 (enva) and op 8 (envd) to look up an envelope step value
// from an `attack` / `decay` BYTE in 0..127.

export const decayTable: Int16Array = new Int16Array([
  32767, 32767, 32767, 16384, 10922, 8192, 6553, 4681, 3640, 2978,
  2520, 2048, 1724, 1489, 1310, 1129, 992, 885, 799, 712, 642, 585,
  537, 489, 448, 414, 385, 356, 330, 309, 289, 270, 254, 239, 225,
  212, 201, 190, 181, 171, 163, 155, 148, 141, 134, 129, 123, 118,
  113, 108, 104, 100, 96, 93, 89, 86, 83, 80, 77, 75, 72, 70, 68,
  65, 63, 61, 60, 58, 56, 54, 53, 51, 50, 49, 47, 46, 45, 44, 43,
  41, 40, 39, 38, 38, 37, 36, 35, 34, 33, 33, 32, 31, 30, 30, 29,
  29, 28, 27, 27, 26, 26, 25, 25, 24, 24, 23, 23, 22, 22, 22, 21,
  21, 20, 20, 20, 19, 19, 19, 18, 18, 18, 17, 17, 17, 17, 16, 16, 16,
]);
