import { afterEach, describe, expect, it } from 'vitest';

import { createConversationHydrationFlightRegistry } from './conversation-hydration-flight';

interface Page {
  id: string;
}

interface Snapshot {
  id: string;
}

describe('conversation hydration flight registry', () => {
  const registry = createConversationHydrationFlightRegistry<Page, Snapshot>();

  afterEach(() => {
    registry.clear();
  });

  it('reuses the in-flight promise for the same thread', async () => {
    let startCount = 0;
    const start = () => {
      startCount += 1;
      return Promise.resolve({
        page: { id: `page-${startCount}` },
        snapshot: { id: `snap-${startCount}` },
      });
    };

    const first = registry.begin('thread-a', start);
    const second = registry.begin('thread-a', start);

    expect(second).toBe(first);
    await expect(first.promise).resolves.toEqual({
      page: { id: 'page-1' },
      snapshot: { id: 'snap-1' },
    });
    expect(startCount).toBe(1);
  });

  it('starts independent flights for different threads', async () => {
    const startA = () =>
      Promise.resolve({ page: { id: 'a' }, snapshot: { id: 'a' } });
    const startB = () =>
      Promise.resolve({ page: { id: 'b' }, snapshot: { id: 'b' } });

    const flightA = registry.begin('thread-a', startA);
    const flightB = registry.begin('thread-b', startB);

    expect(flightA).not.toBe(flightB);
    await expect(flightA.promise).resolves.toEqual({
      page: { id: 'a' },
      snapshot: { id: 'a' },
    });
    await expect(flightB.promise).resolves.toEqual({
      page: { id: 'b' },
      snapshot: { id: 'b' },
    });
  });

  it('aborts the in-flight controller and drops the registry entry', () => {
    let capturedSignal: AbortSignal | undefined;
    registry.begin(
      'thread-a',
      (signal) =>
        new Promise(() => {
          capturedSignal = signal;
        }),
    );

    expect(registry.has('thread-a')).toBe(true);
    registry.abort('thread-a');

    expect(capturedSignal?.aborted).toBe(true);
    expect(registry.has('thread-a')).toBe(false);
  });

  it('allows a new flight after the previous one settles', async () => {
    const first = registry.begin('thread-a', () =>
      Promise.resolve({ page: { id: 'one' }, snapshot: null }),
    );
    await first.promise;

    const second = registry.begin('thread-a', () =>
      Promise.resolve({ page: { id: 'two' }, snapshot: null }),
    );

    expect(second).not.toBe(first);
    await expect(second.promise).resolves.toEqual({
      page: { id: 'two' },
      snapshot: null,
    });
  });
});
