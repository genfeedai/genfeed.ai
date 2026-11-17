import { describe, expect, it } from 'vitest';
import { followCreatorAfterSignup } from './follow-creator.util';

describe('followCreatorAfterSignup', () => {
  it('subscribes the new account to the creator it came from', async () => {
    const requests: unknown[] = [];
    const outcome = await followCreatorAfterSignup(
      {
        subscribe: async (request) => {
          requests.push(request);
          return { status: 'subscribed' };
        },
      },
      'acme',
      1000,
    );

    expect(outcome).toBe('subscribed');
    expect(requests).toEqual([{ handle: 'acme', source: 'profile' }]);
  });

  it('reports a confirmation email for an unverified address', async () => {
    const outcome = await followCreatorAfterSignup(
      { subscribe: async () => ({ status: 'confirmation_sent' }) },
      'acme',
      1000,
    );

    expect(outcome).toBe('confirmation_sent');
  });

  it('does not throw when the creator cannot be subscribed to', async () => {
    const outcome = await followCreatorAfterSignup(
      {
        subscribe: async () => {
          throw new Error('Creator not found');
        },
      },
      'gone',
      1000,
    );

    expect(outcome).toBe('unavailable');
  });

  it('stops waiting for a slow answer', async () => {
    const outcome = await followCreatorAfterSignup(
      { subscribe: () => new Promise(() => undefined) },
      'acme',
      10,
    );

    expect(outcome).toBe('timed-out');
  });
});
