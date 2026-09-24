import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProvisionalEventPool } from './agent-chat-stream.provisional';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const payload = (threadId: string) => ({
  threadId,
  runId: `run-${threadId}`,
  token: 'x',
});
it('bounds unclaimed buckets and tombstones without losing a protected FIFO', () => {
  const pool = createProvisionalEventPool();
  const protectedKeys = new Set([pool.keyFor('owned', 'run-owned')]);
  pool.add('agent:token', payload('owned'), protectedKeys, 2);
  for (let i = 0; i < 152; i++)
    pool.add('agent:token', payload(`foreign-${i}`), protectedKeys, 2);
  expect(pool.claim('owned', 'run-owned', 1, protectedKeys, 2)).toMatchObject({
    reconcile: false,
    events: [{ payload: payload('owned') }],
  });
  expect(
    pool.claim('foreign-0', 'run-foreign-0', 1, protectedKeys, 2).reconcile,
  ).toBe(true);
  expect(
    pool.claim('unknown', 'run-unknown', 3, protectedKeys, 3).reconcile,
  ).toBe(false);
  expect(
    pool.claim('foreign-151', 'run-foreign-151', 1, protectedKeys, 2).reconcile,
  ).toBe(false);
  pool.reset();
  expect(pool.claim('unknown', 'run-unknown', 1, new Set(), 2)).toEqual({
    events: [],
    reconcile: false,
  });
});
it('retains more than 50 owned buckets until protection is released', () => {
  const pool = createProvisionalEventPool();
  const protectedKeys = new Set(
    Array.from({ length: 60 }, (_, i) =>
      pool.keyFor(`owned-${i}`, `run-owned-${i}`),
    ),
  );
  for (let i = 0; i < 60; i++)
    pool.add('agent:token', payload(`owned-${i}`), protectedKeys, 1);
  vi.advanceTimersByTime(300_001);
  pool.prune(protectedKeys, 1);
  expect(
    pool.claim('owned-0', 'run-owned-0', 1, protectedKeys, 1).events,
  ).toHaveLength(1);
  pool.prune(new Set(), 1);
  expect(pool.claim('owned-59', 'run-owned-59', 1, new Set(), 1)).toEqual({
    events: [],
    reconcile: true,
  });
});
it.each([2049, 1])('isolates own bucket overflow for %s events', (count) => {
  const pool = createProvisionalEventPool();
  pool.add('agent:token', payload('other'), new Set(), 1);
  for (let i = 0; i < count; i++)
    pool.add(
      'agent:token',
      {
        ...payload('overflow'),
        token: count === 1 ? 'x'.repeat(1_048_577) : 'x',
      },
      new Set(),
      1,
    );
  expect(pool.claim('overflow', 'run-overflow', 1, new Set(), 1)).toEqual({
    events: [],
    reconcile: true,
  });
  expect(pool.claim('other', 'run-other', 1, new Set(), 1)).toMatchObject({
    reconcile: false,
    events: [{ payload: payload('other') }],
  });
});
