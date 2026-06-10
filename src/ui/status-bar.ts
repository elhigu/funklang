// src/ui/status-bar.ts
//
// The footer-right activity light. This app does real background work — it
// assembles the exact .bin and Shrinkler-packs it in a Web Worker, and plays
// auditioned audio — but the corner badge used to just blink a static "READY"
// with no meaning. Now any background task registers itself via begin(); while
// at least one task is live the badge blinks amber and shows the task's label
// ("ASSEMBLING", "SHRINKLING", "PLAYING"), falling back to a steady "READY"
// when everything is idle.
//
// Tasks are ref-counted: overlapping work (a fresh edit assembling while the
// previous shrink is still running) keeps the light on until the LAST task
// ends, and the most recently begun task is the one whose label shows.

export interface StatusBar {
  /** Register an active background task; returns a function that ends it.
   *  Calling the returned function more than once is a no-op. */
  begin(label: string): () => void;
}

export function wireStatusBar(root: HTMLElement): StatusBar {
  const box = root.querySelector('.footer-right') as HTMLElement | null;
  const label = box?.querySelector('.status-label') as HTMLElement | null;
  // Insertion-ordered live tasks; the last entry (most recent) is displayed.
  const active = new Map<number, string>();
  let seq = 0;

  const repaint = (): void => {
    if (!box) return;
    if (active.size === 0) {
      box.classList.remove('busy');
      if (label) label.textContent = 'READY';
      return;
    }
    box.classList.add('busy');
    let last = '';
    for (const v of active.values()) last = v;   // Map preserves insertion order
    if (label) label.textContent = last;
  };

  const begin = (text: string): (() => void) => {
    const id = seq++;
    active.set(id, text);
    repaint();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      active.delete(id);
      repaint();
    };
  };

  repaint();
  return { begin };
}
