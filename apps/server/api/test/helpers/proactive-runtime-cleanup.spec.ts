import {
  assertOwnedPinsUnchanged,
  assertOwnedRetentionUsers,
  planOwnedPinRetention,
  runOwnedPinRetentionCleanup,
  runOwnedRuntimeCleanup,
} from '@api-test/helpers/proactive-runtime-cleanup';
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

function pin(id: string, organizationId: string, brandId: string | null) {
  return {
    id,
    organizationId,
    brandId,
    createdByUserId: `creator-${id}`,
    recordKind: 'post',
    recordId: `post-${id}`,
    recordVersion: '1',
    contentDigest: `digest-${id}`,
    idempotencyKey: `key-${id}`,
    provenance: { fixture: id },
    createdAt: new Date('2026-10-01T00:00:00Z'),
  };
}

describe('owned immutable pin retention', () => {
  it('retains no ancestors when no owned pins exist', () => {
    expect(planOwnedPinRetention(['owned'], [])).toEqual({
      pins: [],
      organizationIds: [],
      brandIds: [],
      creatorIds: [],
    });
  });

  it('retains one pin and its exact ancestor identities', () => {
    const ownedPin = pin('one', 'owned', 'brand-one');
    expect(planOwnedPinRetention(['owned'], [ownedPin])).toEqual({
      pins: [ownedPin],
      organizationIds: ['owned'],
      brandIds: ['brand-one'],
      creatorIds: ['creator-one'],
    });
  });

  it('retains multiple owned organizations, excludes foreign pins and handles nullable brands', () => {
    const first = pin('one', 'owned-a', 'brand-one');
    const second = pin('two', 'owned-b', null);
    const foreign = pin('foreign', 'foreign', 'foreign-brand');
    expect(
      planOwnedPinRetention(['owned-a', 'owned-b'], [first, second, foreign]),
    ).toEqual({
      pins: [first, second],
      organizationIds: ['owned-a', 'owned-b'],
      brandIds: ['brand-one'],
      creatorIds: ['creator-one', 'creator-two'],
    });
  });

  it('checks every immutable field and row identity before connections close', () => {
    const original = pin('one', 'owned', 'brand-one');
    expect(() =>
      assertOwnedPinsUnchanged([original], [{ ...original }]),
    ).not.toThrow();
    for (const change of [
      { id: 'other' },
      { organizationId: 'other' },
      { brandId: null },
      { createdByUserId: 'other' },
      { recordKind: 'newsletter' },
      { recordId: 'other' },
      { recordVersion: '2' },
      { contentDigest: 'other' },
      { idempotencyKey: 'other' },
      { provenance: { fixture: 'other' } },
      { createdAt: new Date('2026-10-02T00:00:00Z') },
    ])
      expect(() =>
        assertOwnedPinsUnchanged([original], [{ ...original, ...change }]),
      ).toThrow();
    expect(() => assertOwnedPinsUnchanged([original], [])).toThrow();
  });

  it.each(['writer', 'pin-read'])(
    'does not authorize queue or data disposal after %s failure',
    async (phase) => {
      const attempted: string[] = [];
      const failure = new Error(phase);
      await expect(
        runOwnedPinRetentionCleanup(
          [
            async () => {
              attempted.push('writer.stop');
              if (phase === 'writer') throw failure;
            },
          ],
          async () => {
            attempted.push('pins.read');
            throw failure;
          },
          async () => {
            attempted.push('queue.obliterate');
            attempted.push('post.deleteMany');
          },
          [
            async () => {
              attempted.push('redis.quit');
            },
            async () => {
              attempted.push('prisma.disconnect');
            },
          ],
        ),
      ).rejects.toBeInstanceOf(AggregateError);
      expect(attempted).toEqual([
        'writer.stop',
        ...(phase === 'pin-read' ? ['pins.read'] : []),
        'redis.quit',
        'prisma.disconnect',
      ]);
    },
  );

  it('attempts independent Redis and Prisma closes after disposal and proof failures', async () => {
    const attempted: string[] = [];
    const dataFailure = new Error('post deletion failed');
    const proofFailure = new Error('pin changed');
    const redisFailure = new Error('redis close failed');
    let caught: unknown;
    try {
      await runOwnedPinRetentionCleanup(
        [
          async () => {
            attempted.push('writer.stop');
          },
        ],
        async () => {
          attempted.push('pins.read');
          return planOwnedPinRetention(['owned'], [pin('one', 'owned', null)]);
        },
        async (retention) => {
          expect(retention.organizationIds).toEqual(['owned']);
          await runOwnedRuntimeCleanup([
            async () => {
              attempted.push('post.deleteMany');
              throw dataFailure;
            },
            async () => {
              attempted.push('pins.prove');
              throw proofFailure;
            },
          ]);
        },
        [
          async () => {
            attempted.push('redis.quit');
            throw redisFailure;
          },
          async () => {
            attempted.push('prisma.disconnect');
          },
        ],
      );
    } catch (error) {
      caught = error;
    }
    expect(attempted).toEqual([
      'writer.stop',
      'pins.read',
      'post.deleteMany',
      'pins.prove',
      'redis.quit',
      'prisma.disconnect',
    ]);
    expect(caught).toBeInstanceOf(AggregateError);
    if (!(caught instanceof AggregateError))
      throw new Error('Expected cleanup failure');
    expect(caught.errors[0]).toMatchObject({
      errors: [dataFailure, proofFailure],
    });
    expect(caught.errors[1]).toBe(redisFailure);
  });
});

describe('retained fixture user ownership', () => {
  it('accepts empty retention and the exact fixture user', () => {
    expect(() => assertOwnedRetentionUsers('fixture-user', [])).not.toThrow();
    expect(() =>
      assertOwnedRetentionUsers('fixture-user', ['fixture-user']),
    ).not.toThrow();
  });

  it('blocks every mutation and independently closes handles for a foreign creator in an owned pin', async () => {
    const attempted: string[] = [];
    const ownedPin = {
      ...pin('one', 'owned', null),
      createdByUserId: 'foreign-user',
    };
    await expect(
      runOwnedPinRetentionCleanup(
        [
          async () => {
            attempted.push('writer.stop');
          },
        ],
        async () => {
          attempted.push('pins.read');
          const retention = planOwnedPinRetention(['owned'], [ownedPin]);
          assertOwnedRetentionUsers('fixture-user', retention.creatorIds);
          return retention;
        },
        async () => {
          attempted.push('queue.obliterate');
          attempted.push('user.updateMany');
        },
        [
          async () => {
            attempted.push('redis.quit');
          },
          async () => {
            attempted.push('prisma.disconnect');
          },
        ],
      ),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(attempted).toEqual([
      'writer.stop',
      'pins.read',
      'redis.quit',
      'prisma.disconnect',
    ]);
    expect(ownedPin.createdByUserId).toBe('foreign-user');
  });

  it('rejects foreign organization or brand owners as well as pin creators', () => {
    expect(() =>
      assertOwnedRetentionUsers('fixture-user', [
        'fixture-user',
        'foreign-owner',
      ]),
    ).toThrow();
  });
});
