// tests/ui/about-modal.test.ts
// @vitest-environment jsdom
//
// The About / Credits modal: a curated end-user blurb + credits + links, the
// build-time version, and the live-rendered changelog. Content is static, so
// these tests check the open/close wiring and that the three required pieces
// (version, a credit, changelog history) are present.
import { describe, it, expect, beforeEach } from 'vitest';
import { mountAboutModal } from '../../src/ui/about-modal';

describe('about modal', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('is hidden until opened', () => {
    const about = mountAboutModal(root);
    const overlay = root.querySelector('#about-overlay') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('hidden')).toBe(true);
    expect(about.isOpen()).toBe(false);
  });

  it('open() shows the version, a credit, and the changelog history', () => {
    const about = mountAboutModal(root);
    about.open();
    const overlay = root.querySelector('#about-overlay') as HTMLElement;
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(about.isOpen()).toBe(true);

    // Version badge (build-time injected; "dev" fallback in a raw test env).
    const ver = root.querySelector('.about-version') as HTMLElement;
    expect(ver.textContent).toMatch(/\d+\.\d+\.\d+|dev/);

    // Curated credit + the live changelog (rendered from CHANGELOG.md).
    expect(overlay.textContent).toContain('Virgill');
    expect(overlay.querySelector('.about-changelog')?.innerHTML).toContain('<h3>');
  });

  it('closes on the ✕ button, click-outside, and Esc', () => {
    const about = mountAboutModal(root);
    const overlay = root.querySelector('#about-overlay') as HTMLElement;

    about.open();
    (root.querySelector('#about-close') as HTMLButtonElement).click();
    expect(about.isOpen()).toBe(false);

    about.open();
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // target === overlay
    expect(about.isOpen()).toBe(false);

    about.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(about.isOpen()).toBe(false);
  });
});
