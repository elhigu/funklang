// Helpers ported verbatim from Aklang2Asm (Program.cs).

/** Program.cs DividerCode 1836. */
export function dividerCode(): string {
  return ';----------------------------------------------------------------------------\n';
}

/** Program.cs RemapVarToRegisterOrImmediate 1699. */
export function remapVarToRegisterOrImmediate(value: string): string {
  switch (value) {
    case 'v1':
      return 'd0';
    case 'v2':
      return 'd1';
    case 'v3':
      return 'd2';
    case 'v4':
      return 'd3';
    case 'smp':
      return 'd7';
    default:
      return '#' + value;
  }
}

/** Program.cs GetInstanceOffset 1689. */
export function getInstanceOffset(value: string, offsetSize: number): string {
  const result = Number(value);
  // int.TryParse semantics: only an integer string parses.
  if (Number.isInteger(result) && /^[+-]?\d+$/.test(value.trim())) {
    return String(result * offsetSize);
  }
  return '0';
}

const DECAY_TABLE: number[] = [
  32767, 32767, 32767, 16384, 10922, 8192, 6553, 4681, 3640, 2978,
  2520, 2048, 1724, 1489, 1310, 1129, 992, 885, 799, 712,
  642, 585, 537, 489, 448, 414, 385, 356, 330, 309,
  289, 270, 254, 239, 225, 212, 201, 190, 181, 171,
  163, 155, 148, 141, 134, 129, 123, 118, 113, 108,
  104, 100, 96, 93, 89, 86, 83, 80, 77, 75,
  72, 70, 68, 65, 63, 61, 60, 58, 56, 54,
  53, 51, 50, 49, 47, 46, 45, 44, 43, 41,
  40, 39, 38, 38, 37, 36, 35, 34, 33, 33,
  32, 31, 30, 30, 29, 29, 28, 27, 27, 26,
  26, 25, 25, 24, 24, 23, 23, 22, 22, 22,
  21, 21, 20, 20, 20, 19, 19, 19, 18, 18,
  18, 17, 17, 17, 17, 16, 16, 16,
];

/** Program.cs GetDecayValue 1712. */
export function getDecayValue(index: number): string {
  return '#' + (DECAY_TABLE[index]! << 8);
}

const CHORD_TABLE: number[] = [
  0, 69376, 73472, 77824, 82432, 87552, 92672, 98048, 103936, 110080,
  116736, 123648, 131072,
];

/** Program.cs GetChordValue 1732. */
export function getChordValue(index: number): string {
  return '#' + CHORD_TABLE[index]!;
}
