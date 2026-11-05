import { dispatchFundedSubmission } from '@api/collections/workflows/services/workflow-funded-dispatch.util';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { describe, expect, it } from 'vitest';

type Hold = 'bound' | 'held' | 'released';
type Provider = 'accepts' | 'refuses' | 'times out';

/**
 * One funded output: its credit hold, the workflow continuation waiting on it,
 * and a provider that accepts, definitively refuses, or times out. `noHold`
 * makes binding fail because the hold is missing.
 */
function fundedOutput(provider: Provider, options: { noHold?: boolean } = {}) {
  const world = {
    continuation: 'waiting' as string,
    hold: 'held' as Hold,
    submitted: [] as string[],
  };
  const dispatch = () =>
    dispatchFundedSubmission({
      failContinuation: async ({ continuationId, error, organizationId }) => {
        world.continuation = `failed ${continuationId} in ${organizationId}: ${error}`;
      },
      funding: {
        bind: async (ingredientId) => {
          if (options.noHold) {
            throw new Error('no hold');
          }
          if (ingredientId === 'out-1') {
            world.hold = 'bound';
          }
        },
        reject: async (ingredientId) => {
          if (ingredientId === 'out-1') {
            world.hold = 'released';
          }
        },
      },
      isRejected: (error) =>
        error instanceof Error && error.message === 'refused',
      submit: async () => {
        world.submitted.push('out-1');
        if (provider === 'accepts') {
          return 'job-1';
        }
        throw new Error(provider === 'refuses' ? 'refused' : 'timeout');
      },
      target: {
        context: { organizationId: 'org-1' } as ExecutionContext,
        continuationId: 'cont-1',
        ingredientId: 'out-1',
      },
    });
  return { dispatch, world };
}

describe('dispatchFundedSubmission', () => {
  it('submits a bound output and keeps its hold for the job', async () => {
    const { dispatch, world } = fundedOutput('accepts');

    await expect(dispatch()).resolves.toBe('job-1');
    expect(world).toEqual({
      continuation: 'waiting',
      hold: 'bound',
      submitted: ['out-1'],
    });
  });

  it('never submits, fails the continuation and releases the hold when binding fails', async () => {
    const { dispatch, world } = fundedOutput('accepts', { noHold: true });

    await expect(dispatch()).rejects.toThrow('no hold');
    expect(world).toEqual({
      continuation: 'failed cont-1 in org-1: no hold',
      hold: 'released',
      submitted: [],
    });
  });

  it.each([
    ['refuses', 'refused', 'released'],
    ['times out', 'timeout', 'bound'],
  ] as const)(
    'when the provider %s (%s), the hold ends %s and the continuation keeps waiting',
    async (provider, message, hold) => {
      const { dispatch, world } = fundedOutput(provider);

      await expect(dispatch()).rejects.toThrow(message);
      expect(world).toEqual({
        continuation: 'waiting',
        hold,
        submitted: ['out-1'],
      });
    },
  );
});
