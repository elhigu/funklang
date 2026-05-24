import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/patch/events';

describe('EventBus', () => {
  it('delivers events to all subscribers', () => {
    const bus = new EventBus<number>();
    const seenA: number[] = [];
    const seenB: number[] = [];
    bus.on((e) => seenA.push(e));
    bus.on((e) => seenB.push(e));

    bus.emit(1);
    bus.emit(2);

    expect(seenA).toEqual([1, 2]);
    expect(seenB).toEqual([1, 2]);
  });

  it('on() returns a disposer that unsubscribes', () => {
    const bus = new EventBus<string>();
    const seen: string[] = [];
    const dispose = bus.on((e) => seen.push(e));

    bus.emit('a');
    dispose();
    bus.emit('b');

    expect(seen).toEqual(['a']);
  });
});
