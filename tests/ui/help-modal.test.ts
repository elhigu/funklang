// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { helpOverlayHtml, wireHelp } from '../../src/ui/help-modal';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  // The real app template also includes the ? button in its header; the
  // modal markup itself only carries the overlay + close button, so add a
  // standalone trigger to exercise the wiring.
  root.innerHTML = `<button id="btn-help">?</button>${helpOverlayHtml()}`;
  document.body.appendChild(root);
});

describe('help-modal', () => {
  it('renders the overlay hidden by default', () => {
    const overlay = root.querySelector('#help-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('the ? trigger toggles the overlay open and closed', () => {
    const help = wireHelp(root);
    const overlay = root.querySelector('#help-overlay') as HTMLElement;
    const trigger = root.querySelector('#btn-help') as HTMLButtonElement;
    expect(help.isOpen()).toBe(false);
    trigger.click();
    expect(help.isOpen()).toBe(true);
    expect(overlay.classList.contains('hidden')).toBe(false);
    trigger.click();
    expect(help.isOpen()).toBe(false);
  });

  it('the ✕ close button hides an open overlay', () => {
    const help = wireHelp(root);
    help.toggle();                       // open
    expect(help.isOpen()).toBe(true);
    (root.querySelector('#help-close') as HTMLButtonElement).click();
    expect(help.isOpen()).toBe(false);
  });

  it('clicking the overlay backdrop closes it; clicking the card does not', () => {
    const help = wireHelp(root);
    help.toggle();                       // open
    const overlay = root.querySelector('#help-overlay') as HTMLElement;
    // Click on the card (inner content) — should stay open.
    (root.querySelector('.help-card') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(help.isOpen()).toBe(true);
    // Click directly on the overlay backdrop — closes.
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(help.isOpen()).toBe(false);
  });

  it('the markup carries the expected section headers', () => {
    const headers = Array.from(root.querySelectorAll('.help-body h3')).map((h) => h.textContent);
    expect(headers).toContain('Playback');
    expect(headers).toContain('Slots (phases)');
    expect(headers).toContain('Validation (red = needs fixing)');
  });

  it('links to example .akp patches', () => {
    const a = root.querySelector('.help-intro a') as HTMLAnchorElement | null;
    expect(a?.getAttribute('href')).toContain('virgill1974/AmigaKlang');
  });
});
