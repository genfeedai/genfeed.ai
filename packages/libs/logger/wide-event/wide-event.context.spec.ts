import { describe, expect, it } from 'vitest';
import {
  enrichWideEvent,
  getWideEvent,
  readWideEventOutcome,
  recordWideEventError,
  runWithWideEvent,
  toWideEventError,
} from './wide-event.context';
import { startWideEvent } from './wide-event.lifecycle';

function createEvent() {
  return startWideEvent({
    identity: { service: 'api' },
    kind: 'http',
    requestId: 'req-1',
    trace: { spanId: 'span-1', traceId: 'trace-1' },
  }).event;
}

describe('enrichWideEvent', () => {
  it('does nothing outside a request or job', () => {
    expect(() => enrichWideEvent({ user: { id: 'u1' } })).not.toThrow();
    expect(getWideEvent()).toBeUndefined();
  });

  it('merges buckets from separate call sites onto one event', () => {
    const event = createEvent();

    runWithWideEvent(event, () => {
      enrichWideEvent({ user: { id: 'u1' } });
      enrichWideEvent({
        user: { subscription_tier: 'pro' },
        brand: { id: 'b1' },
      });
    });

    expect(event.user).toEqual({ id: 'u1', subscription_tier: 'pro' });
    expect(event.brand).toEqual({ id: 'b1' });
  });

  it('never overwrites a value with undefined or adds empty buckets', () => {
    const event = createEvent();

    runWithWideEvent(event, () => {
      enrichWideEvent({ user: { id: 'u1' } });
      enrichWideEvent({ user: { id: undefined }, brand: { id: undefined } });
      enrichWideEvent({ credits: undefined });
    });

    expect(event.user).toEqual({ id: 'u1' });
    expect(event).not.toHaveProperty('brand');
    expect(event).not.toHaveProperty('credits');
  });

  it('reaches the event from async continuations of the same request', async () => {
    const event = createEvent();

    await runWithWideEvent(event, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      enrichWideEvent({ generation: { model: 'veo-3.1' } });
    });

    expect(event.generation).toEqual({ model: 'veo-3.1' });
  });

  it('keeps concurrent requests apart', async () => {
    const first = createEvent();
    const second = createEvent();

    await Promise.all([
      runWithWideEvent(first, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        enrichWideEvent({ who: { id: 'first' } });
      }),
      runWithWideEvent(second, async () => {
        enrichWideEvent({ who: { id: 'second' } });
      }),
    ]);

    expect(first.who).toEqual({ id: 'first' });
    expect(second.who).toEqual({ id: 'second' });
  });
});

describe('recordWideEventError', () => {
  it('keeps the first failure of a request', () => {
    const event = createEvent();

    runWithWideEvent(event, () => {
      recordWideEventError(new TypeError('first'), { status: 500 });
      recordWideEventError(new Error('second'));
    });

    expect(event.error).toMatchObject({
      message: 'first',
      status: 500,
      type: 'TypeError',
    });
  });
});

describe('toWideEventError', () => {
  it.each([
    [
      'an Error with a code',
      Object.assign(new Error('boom'), { code: 'E_BOOM' }),
      { code: 'E_BOOM', message: 'boom', type: 'Error' },
    ],
    [
      'an error-shaped object',
      { message: 'driver failed', name: 'DriverError', status: 502 },
      { message: 'driver failed', status: 502, type: 'DriverError' },
    ],
    ['a string', 'plain', { message: 'plain', type: 'NonError' }],
    [
      'something unreadable',
      42,
      { message: 'Unknown error', type: 'NonError' },
    ],
  ])('reads %s', (_label, input, expected) => {
    expect(toWideEventError(input)).toMatchObject(expected);
  });

  it('bounds the stack so one failure cannot bloat the event', () => {
    const error = new Error('deep');
    error.stack = 'x'.repeat(50_000);

    expect(toWideEventError(error).stack).toHaveLength(4_000);
  });
});

describe('readWideEventOutcome', () => {
  it.each([
    [200, false, 'success'],
    [302, false, 'success'],
    [404, true, 'client_error'],
    [401, false, 'client_error'],
    [500, false, 'error'],
    [503, true, 'error'],
    [undefined, false, 'success'],
    [undefined, true, 'error'],
    [200, true, 'error'],
  ] as const)('status %s with error=%s is %s', (status, hasError, outcome) => {
    expect(readWideEventOutcome(status, hasError)).toBe(outcome);
  });
});
