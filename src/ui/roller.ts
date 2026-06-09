// Pure math for the touch tuner's roller knobs and swipe navigation.
//
// A roller is a draggable strip tied to a step magnitude (±1, ±10, ±100,
// ±1000). Dragging it up/down crosses "notches"; each notch applies one step.
// The handler feeds an UP-POSITIVE drag distance (startY − currentY) so a
// finger moving up increases the value. Value is computed ABSOLUTELY from the
// drag start (start value + notches × step), never incrementally, so a slow
// drag and a fast drag of the same distance land on the same value.

/** How many notches an up-positive drag of `dragPx` crosses. Sign = direction. */
export function rollerNotches(dragPx: number, pxPerNotch: number): number {
  if (pxPerNotch <= 0 || !Number.isFinite(dragPx)) return 0;
  return Math.trunc(dragPx / pxPerNotch);
}

/**
 * Apply `notches × step` to `startValue`, clamped to [min, max]. The result is
 * also snapped onto the step grid relative to startValue (so a step-2 roller
 * can't produce an odd value from an even start).
 */
export function applyRoller(
  startValue: number, notches: number, step: number, min: number, max: number,
): number {
  const next = startValue + notches * step;
  return Math.max(min, Math.min(max, next));
}

/**
 * Wrapped neighbour index for a swipe. `dir` = +1 (next / swipe up) or −1
 * (prev / swipe down). Wraps past the ends so navigation is continuous.
 */
export function wrapIndex(idx: number, len: number, dir: number): number {
  if (len <= 0) return 0;
  return ((idx + dir) % len + len) % len;
}

/**
 * How many param-steps a vertical swipe of `dragPx` (up-positive) crosses,
 * given the per-row height. Used to move the active param while the finger is
 * still down (one row per `rowPx` of travel).
 */
export function swipeRows(dragPx: number, rowPx: number): number {
  if (rowPx <= 0 || !Number.isFinite(dragPx)) return 0;
  return Math.trunc(dragPx / rowPx);
}
