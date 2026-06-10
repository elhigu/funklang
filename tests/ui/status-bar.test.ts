// tests/ui/status-bar.test.ts
// @vitest-environment jsdom
//
// The footer-right activity light. Idle reads "READY" (steady); any registered
// background task switches it to a blinking, labelled "busy" state. Tasks are
// ref-counted so overlapping work doesn't clear the light early.
import { describe, it, expect, beforeEach } from 'vitest';
import { wireStatusBar } from '../../src/ui/status-bar';

describe('footer status light', () => {
  let root: HTMLElement;
  let box: HTMLElement;
  let label: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    box = document.createElement('div');
    box.className = 'footer-right';
    box.innerHTML = `<span class="blink">●</span><span class="status-label">READY</span>`;
    root.appendChild(box);
    document.body.appendChild(root);
    label = box.querySelector('.status-label') as HTMLElement;
  });

  it('reads READY and is not busy when idle', () => {
    wireStatusBar(root);
    expect(label.textContent).toBe('READY');
    expect(box.classList.contains('busy')).toBe(false);
  });

  it('shows the task label and goes busy while a task is active', () => {
    const status = wireStatusBar(root);
    const done = status.begin('ASSEMBLING');
    expect(label.textContent).toBe('ASSEMBLING');
    expect(box.classList.contains('busy')).toBe(true);
    done();
    expect(label.textContent).toBe('READY');
    expect(box.classList.contains('busy')).toBe(false);
  });

  it('stays busy until the LAST overlapping task ends (ref-counted)', () => {
    const status = wireStatusBar(root);
    const endA = status.begin('ASSEMBLING');
    const endB = status.begin('SHRINKLING');
    expect(box.classList.contains('busy')).toBe(true);
    endB();
    expect(box.classList.contains('busy')).toBe(true);   // A still running
    expect(label.textContent).toBe('ASSEMBLING');
    endA();
    expect(box.classList.contains('busy')).toBe(false);
    expect(label.textContent).toBe('READY');
  });

  it('shows the most recently begun task', () => {
    const status = wireStatusBar(root);
    status.begin('ASSEMBLING');
    status.begin('PLAYING');
    expect(label.textContent).toBe('PLAYING');
  });

  it('ending a task twice is a no-op', () => {
    const status = wireStatusBar(root);
    const end = status.begin('ASSEMBLING');
    const other = status.begin('PLAYING');
    end();
    end();                                  // double end must not pop `other`
    expect(box.classList.contains('busy')).toBe(true);
    expect(label.textContent).toBe('PLAYING');
    other();
    expect(box.classList.contains('busy')).toBe(false);
  });
});
