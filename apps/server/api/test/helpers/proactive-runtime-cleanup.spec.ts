import { runOwnedRuntimeCleanup } from '@test/helpers/proactive-runtime-cleanup';
import { describe, expect, it } from 'vitest';

const resourceOrder = [
  'worker.close',
  'queueEvents.close',
  'queue.obliterate',
  'queue.close',
  'reviewLocks.onModuleDestroy',
  'post.updateMany',
  'post.deleteMany',
  'organization.deleteMany',
  'user.deleteMany',
  'redis.quit',
  'prisma.$disconnect',
];

describe('runOwnedRuntimeCleanup', () => {
  it('completes successful cleanup in order', async () => {
    const completed: string[] = [];
    await expect(
      runOwnedRuntimeCleanup(
        resourceOrder.map((resource) => async () => {
          completed.push(resource);
          return resource;
        }),
      ),
    ).resolves.toBeUndefined();
    expect(completed).toEqual(resourceOrder);
  });

  it('waits for each action to complete before starting the next', async () => {
    const events: string[] = [];
    await runOwnedRuntimeCleanup(
      resourceOrder.map((resource) => async () => {
        events.push(`start:${resource}`);
        await Promise.resolve();
        events.push(`end:${resource}`);
      }),
    );
    expect(events).toEqual(
      resourceOrder.flatMap((resource) => [
        `start:${resource}`,
        `end:${resource}`,
      ]),
    );
  });

  it.each([
    { label: 'first action', failedIndices: [0] },
    { label: 'middle action', failedIndices: [5] },
    {
      label: 'multiple actions including Redis quit',
      failedIndices: [0, 2, 5, 9],
    },
  ])(
    'attempts every resource after failure in $label',
    async ({ failedIndices }) => {
      const attempted: string[] = [];
      const causes = failedIndices.map((index) => new Error(`cause:${index}`));
      const failures = failedIndices.map(
        (index, failureIndex) =>
          new Error(`Failed ${resourceOrder[index]}`, {
            cause: causes[failureIndex],
          }),
      );
      let caught: unknown;
      try {
        await runOwnedRuntimeCleanup(
          resourceOrder.map((resource, index) => async () => {
            attempted.push(resource);
            const failureIndex = failedIndices.indexOf(index);
            if (failureIndex !== -1) throw failures[failureIndex];
          }),
        );
      } catch (error) {
        caught = error;
      }
      expect(attempted).toEqual(resourceOrder);
      expect(attempted.at(-1)).toBe('prisma.$disconnect');
      expect(caught).toBeInstanceOf(AggregateError);
      if (!(caught instanceof AggregateError))
        throw new Error('Expected cleanup failures');
      expect(caught.errors).toHaveLength(failures.length);
      failures.forEach((failure, index) => {
        expect(caught.errors[index]).toBe(failure);
        expect(caught.errors[index].cause).toBe(causes[index]);
      });
    },
  );

  it('retains synchronous throws and non-Error failures', async () => {
    const attempted: string[] = [];
    const failure = { resource: 'worker.close' };
    await expect(
      runOwnedRuntimeCleanup([
        () => {
          attempted.push('worker.close');
          throw failure;
        },
        async () => {
          attempted.push('prisma.$disconnect');
        },
      ]),
    ).rejects.toMatchObject({ errors: [failure] });
    expect(attempted).toEqual(['worker.close', 'prisma.$disconnect']);
  });

  it('accepts an empty cleanup list', async () => {
    await expect(runOwnedRuntimeCleanup([])).resolves.toBeUndefined();
  });
});
