/** Mirrors C# int.ToString("X"): uppercase, no leading zeros, 8-digit
 *  two's-complement for negatives. */
export function csHex(n: number): string {
  const i = n | 0;
  if (i < 0) return (i >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return i.toString(16).toUpperCase();
}
