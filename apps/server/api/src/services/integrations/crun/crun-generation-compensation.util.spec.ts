import type { GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import {
  CRUN_DISPATCH_ABORTED,
  compensateCrunDispatchFailure,
} from '@api/services/integrations/crun/crun-generation-compensation.util';

type Deps = Parameters<typeof compensateCrunDispatchFailure>[0];
type TaskRow = NonNullable<
  Awaited<ReturnType<Deps['tasks']['findForIngredient']>>
>;
type TaskState = 'failed' | 'pending' | 'prepared';
type OutputFunding = 'aborted' | 'held' | 'rejected';

/**
 * A dispatch that threw after funding was reserved: each output's task row (or
 * none), its funding, its generation receipt and the shared pool, as state the
 * compensation changes.
 */
function dispatch(tasks: Record<string, TaskState | null>) {
  const world = {
    failureReasons: {} as Record<string, string>,
    funding: Object.fromEntries(
      Object.keys(tasks).map((id) => [id, 'held']),
    ) as Record<string, OutputFunding>,
    pool: 'reserved' as 'released' | 'reserved',
    receipts: {} as Record<string, string>,
    tasks: { ...tasks },
    unreachable: new Set<string>(),
  };
  const deps: Deps = {
    billing: {
      abortUnsubmittedOutput: async (id) => {
        world.funding[id] = 'aborted';
      },
      recordSubmissionRejection: async (id) => {
        world.funding[id] = 'rejected';
      },
      releasePool: async () => {
        world.pool = 'released';
      },
    },
    receipts: {
      syncTerminal: async (_organizationId, id, signal) => {
        world.receipts[id] = signal;
      },
    },
    tasks: {
      failPrepared: async (task, reasonCode) => {
        const id = task.ingredientId;
        if (world.unreachable.has(id)) {
          throw new Error('db');
        }
        world.tasks[id] = 'failed';
        world.failureReasons[id] = reasonCode;
      },
      // The service returns a Prisma promise; compensation only awaits it.
      findForIngredient: (async (_organizationId: string, id: string) => {
        const state = world.tasks[id];
        // Only the fields compensation reads; the rest of the row is not used.
        return state
          ? ({ id: `task-${id}`, ingredientId: id, state } as TaskRow)
          : null;
      }) as unknown as Deps['tasks']['findForIngredient'],
    },
  };
  return { deps, world };
}

// The fake pool ignores the request; compensation only hands it on.
const billingRequest: GenerationBillingRequest = {};

function compensate(deps: Deps, ingredientIds: string[]): Promise<void> {
  return compensateCrunDispatchFailure(deps, {
    billingRequest,
    ingredientIds,
    organizationId: 'org',
  });
}

describe('compensateCrunDispatchFailure', () => {
  it('aborts an output that never got a task row and releases the pool', async () => {
    const { deps, world } = dispatch({ a: null });

    await compensate(deps, ['a']);

    expect(world.funding).toEqual({ a: 'aborted' });
    expect(world.receipts).toEqual({ a: 'released' });
    expect(world.tasks).toEqual({ a: null });
    expect(world.pool).toBe('released');
  });

  it('fails prepared tasks as rejected and leaves a claimed one to the poller', async () => {
    const { deps, world } = dispatch({
      a: 'prepared',
      b: 'prepared',
      c: 'pending',
    });

    await compensate(deps, ['a', 'b', 'c']);

    expect(world.tasks).toEqual({ a: 'failed', b: 'failed', c: 'pending' });
    expect(world.failureReasons).toEqual({
      a: CRUN_DISPATCH_ABORTED,
      b: CRUN_DISPATCH_ABORTED,
    });
    expect(world.funding).toEqual({ a: 'rejected', b: 'rejected', c: 'held' });
    // The claimed task's acceptance is ambiguous: its receipt stays open for
    // the poller's settle or release.
    expect(world.receipts).toEqual({ a: 'released', b: 'released' });
    expect(world.pool).toBe('released');
  });

  it('still releases the pool when one output cannot be compensated', async () => {
    const { deps, world } = dispatch({ a: 'prepared', b: 'prepared' });
    world.unreachable.add('a');

    await compensate(deps, ['a', 'b']);

    expect(world.tasks).toEqual({ a: 'prepared', b: 'failed' });
    expect(world.funding).toEqual({ a: 'held', b: 'rejected' });
    expect(world.receipts).toEqual({ b: 'released' });
    expect(world.pool).toBe('released');
  });
});
