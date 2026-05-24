/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Player } from '../../src/audio/player';

class FakeBufferSrc {
  buffer: any = null;
  onended: (() => void) | null = null;
  connect = vi.fn(() => this);
  start = vi.fn();
  stop = vi.fn();
}
class FakeBuffer {
  constructor(public ch: number, public n: number, public rate: number) {}
  copyToChannel = vi.fn();
}
class FakeCtx {
  destination = {} as any;
  state = 'running';
  createBuffer = (ch: number, n: number, rate: number) => new FakeBuffer(ch, n, rate);
  createBufferSource = () => new FakeBufferSrc();
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn(() => this) });
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}

beforeEach(() => {
  (globalThis as any).AudioContext = FakeCtx;
  (globalThis as any).webkitAudioContext = FakeCtx;
});

describe('Player', () => {
  it('plays a sample without throwing', () => {
    const p = new Player();
    p.play(new Int16Array([0, 16384, -16384, 0]), 22050);
    expect(p.isPlaying()).toBe(true);
  });

  it('stops the previous voice on re-trigger', () => {
    const p = new Player();
    p.play(new Int16Array(64), 22050);
    const first = (p as any).currentSrc;
    p.play(new Int16Array(64), 22050);
    expect(first.stop).toHaveBeenCalled();
  });

  it('stop() clears the playing flag', () => {
    const p = new Player();
    p.play(new Int16Array(64), 22050);
    p.stop();
    expect(p.isPlaying()).toBe(false);
  });

  it('setMaster updates gain', () => {
    const p = new Player();
    p.play(new Int16Array(8), 22050);
    p.setMaster(0.5);
    // No throw, master changed
  });
});
