/**
 * Make a <select> respond to mouse-wheel: scrolling down advances to the next
 * option, scrolling up to the previous one. Page scroll is suppressed when the
 * pointer is over the element so the gesture is contained.
 */
export function attachWheelStep(sel: HTMLSelectElement): void {
  sel.addEventListener('wheel', (e: WheelEvent) => {
    if (sel.disabled || sel.options.length === 0) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    const next = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + dir));
    if (next === sel.selectedIndex) return;
    sel.selectedIndex = next;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, { passive: false });
}
