import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  collectLearningRuntimePublications,
  type LearningRuntimeFixture,
  learningRuntimeMetrics,
  learningRuntimeScope,
  openLearningRuntimeFixture,
  publishLearningRuntimePost,
  type RuntimePublication,
} from './content-learning-runtime.fixture';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const trackedSpies: Array<{ mockRestore(): void }> = [];
function track<T extends { mockRestore(): void }>(spy: T): T {
  trackedSpies.push(spy);
  return spy;
}

describe('hosted real production learning runtime', () => {
  let fixture: LearningRuntimeFixture;
  const publications: RuntimePublication[] = [];
  beforeAll(async () => {
    fixture = await openLearningRuntimeFixture();
  }, 180000);
  beforeEach(async () => {
    await fixture.resources.check();
  });
  afterEach(async () => {
    try {
      await fixture.drain();
      fixture.transports.assertNoViolations();
    } finally {
      for (const spy of trackedSpies.splice(0)) spy.mockRestore();
    }
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  }, 60000);

  it('mounts real cloud configuration, singleton runner, registrars, v2 graphs and owned routing without duplicate processors', async () => {
    const { CONTENT_LEARNING_ACTION_IDS } = await import(
      '@api/collections/workflows/templates/content-learning-workflows.template'
    );
    const { SYSTEM_WORKFLOW_RUNNER, WORKFLOW_ENGINE_ADAPTER } = await import(
      '@api/collections/workflows/workflows.tokens'
    );
    const { SERVER_TOKENS } = await import('@api/server.dependencies');
    expect(fixture.first.module.get(SYSTEM_WORKFLOW_RUNNER)).toBe(
      fixture.services.runner,
    );
    expect(fixture.first.module.get(WORKFLOW_ENGINE_ADAPTER)).toBe(
      fixture.services.engine,
    );
    expect(fixture.first.module.get(SERVER_TOKENS.prisma)).toBe(
      fixture.first.prisma,
    );
    const ids = fixture.services.engine.getRegisteredActionIds();
    for (const id of Object.values(CONTENT_LEARNING_ACTION_IDS))
      expect(ids.filter((candidate) => candidate === id)).toHaveLength(1);
    for (const id of [
      CONTENT_LEARNING_ACTION_IDS.RECONCILE,
      CONTENT_LEARNING_ACTION_IDS.CHECKPOINT,
    ])
      expect(fixture.services.runner.getWorkflow(id)?.version).toBe(2);
    expect(() =>
      fixture.services.runner.registerAction(
        CONTENT_LEARNING_ACTION_IDS.RECONCILE,
        () => null,
      ),
    ).toThrow();
    await expect(
      fixture.services.runner.enqueueWorkflow(
        {
          canonicalId: 'learning-runtime-unknown',
          actionType: 'learning-runtime-unknown',
          organizationId: fixture.targets[0].organizationId,
          source: 'learning-runtime-owned',
        },
        {
          dispatchClass: (await import('@genfeedai/contracts/queue'))
            .SystemWorkflowDispatchClass.BACKGROUND,
        },
      ),
    ).rejects.toThrow('Unknown system workflow');
    expect(fixture.worker.opts.concurrency).toBe(1);
    const sentinel = await fixture.first.prisma.organization.findFirst({
      where: { id: fixture.targets[0].organizationId, isDeleted: false },
    });
    expect(sentinel?.id).toBe(fixture.targets[0].organizationId);
    const publicTable = await fixture.database.observer.query(
      "SELECT to_regclass('public.organizations') AS name",
    );
    if (publicTable.rows[0].name !== null) {
      expect(
        (
          await fixture.database.observer.query(
            'SELECT count(*)::int AS count FROM public.organizations WHERE id=$1',
            [sentinel?.id],
          )
        ).rows[0].count,
      ).toBe(0);
    } else expect(publicTable.rows[0].name).toBeNull();
  });

  it('collects twenty genuine approved publications and materializes a twenty-contributor baseline through the actual background engine', async () => {
    const target = fixture.targets[0];
    const materialize = track(
      vi.spyOn(fixture.services.materializer, 'materialize'),
    );
    for (let index = 0; index < 20; index++)
      publications.push(
        await publishLearningRuntimePost(
          fixture.first,
          fixture.services,
          target,
        ),
      );
    const collection = await collectLearningRuntimePublications(
      fixture.services,
      target,
      publications,
    );
    expect(collection.failedTargets).toHaveLength(0);
    expect(collection.readyTargets).toHaveLength(20);
    await fixture.drain();
    const scope = await learningRuntimeScope(
      fixture.first,
      fixture.services,
      target,
    );
    const row = await fixture.enqueue(
      'content-learning.reconcile',
      target.organizationId,
      {
        credentialId: target.credentialId,
        materializationOnly: true,
        refreshBucket: 0,
      },
    );
    expect(row.status).toBe('COMPLETED');
    expect(row.nodeResults.some((node) => node.status === 'completed')).toBe(
      true,
    );
    expect(materialize).toHaveBeenCalled();
    const checkpoints =
      await fixture.first.prisma.contentLearningCheckpoint.findMany({
        where: {
          organizationId: target.organizationId,
          credentialId: target.credentialId,
          isDeleted: false,
          validity: 'valid',
        },
      });
    expect(
      new Set(checkpoints.map((checkpoint) => checkpoint.postId)).size,
    ).toBe(20);
    const {
      learningPublicationDependencyRefsV1,
      validLearningCheckpointPublicationV1,
    } = await import(
      '@api/collections/content-learning/services/learning-publication-source.helper'
    );
    for (const checkpoint of checkpoints) {
      const publication = publications.find(
        (post) => post.id === checkpoint.postId,
      );
      expect(publication?.source).toBeTruthy();
      if (!publication?.source)
        throw new Error('Missing canonical publication source');
      const edges =
        await fixture.first.prisma.contentLearningDependency.findMany({
          where: {
            derivedKind: 'checkpoint',
            derivedId: checkpoint.id,
            derivedOrganizationId: target.organizationId,
            isDeleted: false,
            valid: true,
          },
        });
      expect(
        edges
          .map((edge) => [
            edge.sourceKind,
            edge.sourceOrganizationId,
            edge.sourceId,
            edge.sourceVersion,
          ])
          .sort(),
      ).toEqual(
        learningPublicationDependencyRefsV1(publication.source)
          .map((ref) => [ref.kind, ref.organizationId, ref.id, ref.version])
          .sort(),
      );
      expect(edges).toHaveLength(8);
      expect(
        await validLearningCheckpointPublicationV1(
          fixture.first.prisma,
          checkpoint,
        ),
      ).toBe(true);
      expect(checkpoint.sourceAttemptId).toBeTruthy();
      const { learningHash } = await import(
        '@api/collections/content-learning/services/learning-operation.service'
      );
      expect(checkpoint.sourceFingerprint).toBe(
        learningHash([
          checkpoint.postId,
          checkpoint.credentialId,
          checkpoint.windowId,
          checkpoint.requestStartedAt.toISOString(),
          await learningRuntimeMetrics(),
        ]),
      );
      expect(checkpoint.organicProvenance).toMatchObject({
        isPaid: false,
        isPinned: false,
        source: 'provider',
      });
      expect(
        await fixture.first.prisma.postAnalytics.findFirst({
          where: {
            organizationId: target.organizationId,
            postId: checkpoint.postId,
            isDeleted: false,
          },
        }),
      ).toMatchObject({ totalViews: 1000, totalLikes: 10 });
      expect(checkpoint.receivedAt.getTime()).toBeGreaterThanOrEqual(
        checkpoint.requestStartedAt.getTime(),
      );
    }
    const baseline =
      await fixture.first.prisma.contentLearningBaseline.findFirst({
        where: {
          organizationId: target.organizationId,
          credentialId: target.credentialId,
          descriptorHash: scope.scope.rewardProfileId,
          isDeleted: false,
          validity: 'valid',
        },
        orderBy: { cutoff: 'desc' },
      });
    const account = await fixture.first.prisma.contentLearningAccount.findFirst(
      {
        where: {
          id: target.accountId,
          organizationId: target.organizationId,
          isDeleted: false,
        },
      },
    );
    expect(baseline?.count).toBe(20);
    expect(new Set(baseline?.contributorCheckpointIds).size).toBe(20);
    expect(baseline?.snapshotEpoch).toBe(account?.epoch);
    expect(baseline?.snapshotEvidenceRevision).toBe(account?.evidenceRevision);
    expect(
      await fixture.first.prisma.contentLearningDependency.count({
        where: {
          derivedKind: 'baseline',
          derivedId: baseline?.id,
          derivedOrganizationId: target.organizationId,
          isDeleted: false,
          valid: true,
        },
      }),
    ).toBe(21);
    expect(
      fixture.handledJobs.some(
        (job) =>
          job.executionId === row.id &&
          job.canonicalId === 'content-learning.reconcile',
      ),
    ).toBe(true);
  });

  it('coalesces an inflight refresh and replays terminal jobs while preserving checkpoint, evidence and immutable publication association', async () => {
    const target = fixture.targets[0],
      post = publications[0];
    const before =
      await fixture.first.prisma.contentLearningAccount.findFirstOrThrow({
        where: {
          id: target.accountId,
          organizationId: target.organizationId,
          isDeleted: false,
        },
      });
    const checkpointIds = (
      await fixture.first.prisma.contentLearningCheckpoint.findMany({
        where: {
          organizationId: target.organizationId,
          credentialId: target.credentialId,
          isDeleted: false,
        },
      })
    )
      .map((row) => row.id)
      .sort();
    const associations =
      await fixture.first.prisma.postPublishFinalization.findMany({
        where: { organizationId: target.organizationId, postId: post.id },
      });
    const baselines = (
      await fixture.first.prisma.contentLearningBaseline.findMany({
        where: {
          organizationId: target.organizationId,
          credentialId: target.credentialId,
          isDeleted: false,
        },
      })
    )
      .map((row) => row.id)
      .sort();
    await fixture.worker.pause();
    const input = {
      canonicalId: 'content-learning.reconcile',
      actionType: 'content-learning.reconcile',
      organizationId: target.organizationId,
      source: 'learning-runtime-owned',
      inputValues: {
        credentialId: target.credentialId,
        materializationOnly: true,
        refreshBucket: 0,
      },
    };
    const options = {
      dispatchClass: (await import('@genfeedai/contracts/queue'))
        .SystemWorkflowDispatchClass.BACKGROUND,
    };
    const key = `learning-runtime-refresh-${randomUUID()}`;
    let first: string;
    try {
      first = await fixture.services.queue.queueSystemWorkflow(
        input,
        key,
        options,
      );
      expect(
        await fixture.services.queue.queueSystemWorkflow(input, key, options),
      ).toBe(first);
    } finally {
      fixture.worker.resume();
    }
    await fixture.drain();
    await fixture.services.queue.queueSystemWorkflow(input, key, options);
    await fixture.drain();
    await collectLearningRuntimePublications(fixture.services, target, [post]);
    await fixture.drain();
    expect(
      (
        await fixture.first.prisma.contentLearningCheckpoint.findMany({
          where: {
            organizationId: target.organizationId,
            credentialId: target.credentialId,
            isDeleted: false,
          },
        })
      )
        .map((row) => row.id)
        .sort(),
    ).toEqual(checkpointIds);
    expect(
      (
        await fixture.first.prisma.contentLearningAccount.findFirstOrThrow({
          where: {
            id: target.accountId,
            organizationId: target.organizationId,
            isDeleted: false,
          },
        })
      ).evidenceRevision,
    ).toBe(before.evidenceRevision);
    expect(
      await fixture.first.prisma.postPublishFinalization.findMany({
        where: { organizationId: target.organizationId, postId: post.id },
      }),
    ).toEqual(associations);
    expect(
      (
        await fixture.first.prisma.contentLearningBaseline.findMany({
          where: {
            organizationId: target.organizationId,
            credentialId: target.credentialId,
            isDeleted: false,
          },
        })
      )
        .map((row) => row.id)
        .sort(),
    ).toEqual(baselines);
  });

  it.each([true, false])(
    'retains materializationOnly=%s and refreshBucket=0 through the real v2 converter',
    async (materializationOnly) => {
      const execute = track(vi.spyOn(fixture.services.learning, 'execute'));
      const target = fixture.targets[0];
      const row = await fixture.enqueue(
        'content-learning.reconcile',
        target.organizationId,
        {
          credentialId: target.credentialId,
          materializationOnly,
          refreshBucket: 0,
        },
      );
      expect(row.status).toBe('COMPLETED');
      expect(
        execute.mock.calls.some(
          ([action, organizationId, input]) =>
            action === 'content-learning.reconcile' &&
            organizationId === target.organizationId &&
            input.materializationOnly === materializationOnly &&
            input.refreshBucket === 0,
        ),
      ).toBe(true);
    },
  );

  it.each([
    { materializationOnly: 'false' },
    { refreshBucket: '0' },
    { refreshBucket: -1 },
  ])(
    'persists a closed-engine failure for invalid typed reconcile input %j without learning writes',
    async (invalid) => {
      const execute = track(vi.spyOn(fixture.services.learning, 'execute')),
        capture = track(vi.spyOn(fixture.services.capture, 'capture')),
        materializer = track(
          vi.spyOn(fixture.services.materializer, 'materialize'),
        );
      const target = fixture.targets[0];
      const before = await runtimeCounts(fixture, target.organizationId);
      const row = await fixture.enqueue(
        'content-learning.reconcile',
        target.organizationId,
        { credentialId: target.credentialId, ...invalid },
      );
      expect(row.status).toBe('FAILED');
      expect(row.nodeResults.some((node) => node.error)).toBe(true);
      expect(execute).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
      expect(materializer).not.toHaveBeenCalled();
      expect(await runtimeCounts(fixture, target.organizationId)).toEqual(
        before,
      );
    },
  );

  it('rejects an unknown action parameter in a real test graph before the production executor', async () => {
    const source = fixture.services.runner.getWorkflow(
      'content-learning.reconcile',
    );
    expect(source).toBeTruthy();
    if (!source) throw new Error('Missing production workflow');
    const definition = structuredClone(source);
    definition.canonicalId = `learning-runtime-unknown-${randomUUID()}`;
    const node = definition.definition.nodes.find(
      (node) => node.id === definition.resultNodeId,
    );
    expect(node).toBeTruthy();
    if (!node) throw new Error('Missing actual learning action node');
    node.data.config = {
      ...node.data.config,
      parameters: { unknownKey: true },
    };
    fixture.services.runner.registerWorkflow(definition);
    const execute = track(vi.spyOn(fixture.services.learning, 'execute'));
    const row = await fixture.enqueue(
      definition.canonicalId,
      fixture.targets[0].organizationId,
    );
    expect(row.status).toBe('FAILED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant credential authority and independently executes the second tenant', async () => {
    const [first, victim] = fixture.targets;
    const { runWithTenantContext } = await import(
      '@libs/prisma/tenant-context'
    );
    await expect(
      runWithTenantContext({ organizationId: first.organizationId }, () =>
        fixture.first.prisma.credential.findFirst({
          where: {
            id: victim.credentialId,
            organizationId: victim.organizationId,
            isDeleted: false,
          },
        }),
      ),
    ).rejects.toThrow();
    const before = await runtimeCounts(fixture, victim.organizationId);
    await fixture.enqueue('content-learning.reconcile', first.organizationId, {
      credentialId: victim.credentialId,
      materializationOnly: true,
      refreshBucket: 0,
    });
    expect(await runtimeCounts(fixture, victim.organizationId)).toEqual(before);
    const post = await publishLearningRuntimePost(
      fixture.first,
      fixture.services,
      victim,
    );
    const collection = await collectLearningRuntimePublications(
      fixture.services,
      victim,
      [post],
    );
    expect(collection.failedTargets).toHaveLength(0);
    const row = await fixture.enqueue(
      'content-learning.reconcile',
      victim.organizationId,
      {
        credentialId: victim.credentialId,
        materializationOnly: true,
        refreshBucket: 0,
      },
    );
    expect(row.status).toBe('COMPLETED');
    expect(
      await fixture.first.prisma.contentLearningCheckpoint.count({
        where: {
          organizationId: victim.organizationId,
          postId: post.id,
          isDeleted: false,
          validity: 'valid',
        },
      }),
    ).toBe(1);
  });

  it('preserves the actual first checkpoint reason:null through engine output validation', async () => {
    const target = fixture.targets[0],
      post = await publishLearningRuntimePost(
        fixture.first,
        fixture.services,
        target,
      );
    const row = await fixture.enqueue(
      'content-learning.checkpoint',
      target.organizationId,
      { postId: post.id },
    );
    expect(row.status).toBe('COMPLETED');
    const output = record(
      row.nodeResults.find((node) => node.nodeId === 'learning-action')?.output,
    );
    expect(output.reason).toBeNull();
    expect(output.status).toBe('completed');
    expect(typeof output.checkpointId).toBe('string');
    expect(
      await fixture.first.prisma.contentLearningCheckpoint.count({
        where: {
          organizationId: target.organizationId,
          postId: post.id,
          isDeleted: false,
        },
      }),
    ).toBe(1);
  });

  it('persists legacy raw analytics while preserving checkpointId:null and observation_receipt_missing', async () => {
    const target = fixture.targets[0],
      post = await publishLearningRuntimePost(
        fixture.first,
        fixture.services,
        target,
        true,
      );
    const row = await fixture.enqueue(
      'content-learning.checkpoint',
      target.organizationId,
      { postId: post.id },
    );
    expect(row.status).toBe('COMPLETED');
    const output = record(
      row.nodeResults.find((node) => node.nodeId === 'learning-action')?.output,
    );
    expect(output.checkpointId).toBeNull();
    expect(output.reason).toBe('observation_receipt_missing');
    expect(
      await fixture.first.prisma.contentLearningCheckpoint.count({
        where: {
          organizationId: target.organizationId,
          postId: post.id,
          isDeleted: false,
        },
      }),
    ).toBe(0);
    expect(
      await fixture.first.prisma.postAnalytics.count({
        where: {
          organizationId: target.organizationId,
          postId: post.id,
          isDeleted: false,
        },
      }),
    ).toBeGreaterThan(0);
  });

  it('disposes invalid stored dispatch through the real dataset action and preserves runStatus:null without training', async () => {
    const target = fixture.targets[0],
      operationId = randomUUID();
    await fixture.first.prisma.contentLearningOperation.create({
      data: {
        id: operationId,
        actorId: target.actorId,
        organizationId: target.organizationId,
        brandId: target.brandId,
        credentialId: target.credentialId,
        scope: target.credentialId,
        requestId: randomUUID(),
        payloadHash: 'invalid-dispatch-owned-fixture',
        type: 'dataset-train',
        resultReferences: {},
      },
    });
    const source = fixture.services.runner.getWorkflow(
      'content-learning.dataset-train',
    );
    expect(source).toBeTruthy();
    if (!source) throw new Error('Missing production workflow');
    const definition = structuredClone(source);
    definition.canonicalId = `learning-runtime-invalid-dispatch-${randomUUID()}`;
    const node = definition.definition.nodes.find(
      (node) => node.id === definition.resultNodeId,
    );
    expect(node).toBeTruthy();
    if (!node) throw new Error('Missing actual learning action node');
    node.data.inputVariableKeys = [];
    node.data.config = { ...node.data.config, parameters: { operationId } };
    fixture.services.runner.registerWorkflow(definition);
    const row = await fixture.enqueue(
      definition.canonicalId,
      target.organizationId,
    );
    expect(row.status).toBe('COMPLETED');
    expect(
      record(
        row.nodeResults.find((node) => node.nodeId === definition.resultNodeId)
          ?.output,
      ),
    ).toMatchObject({
      status: 'failed',
      runStatus: null,
      reason: 'dispatch_receipt_invalid',
    });
    expect(
      (
        await fixture.first.prisma.contentLearningOperation.findFirstOrThrow({
          where: {
            id: operationId,
            organizationId: target.organizationId,
            isDeleted: false,
          },
        })
      ).status,
    ).toBe('failed');
  });

  it('retains provider-observed zero separately from unavailable saves', async () => {
    const metrics = await learningRuntimeMetrics();
    expect(metrics.metrics.clicks).toMatchObject({
      value: 0,
      availability: 'observed',
    });
    expect(metrics.metrics.saves).toMatchObject({
      availability: 'unavailable',
    });
    expect(metrics.metrics.saves?.value).toBeUndefined();
    const checkpoint =
      await fixture.first.prisma.contentLearningCheckpoint.findFirstOrThrow({
        where: {
          organizationId: fixture.targets[0].organizationId,
          postId: publications[0].id,
          isDeleted: false,
        },
      });
    expect(
      record(record(checkpoint.measurement).metricAvailability).saves,
    ).toMatchObject({ availability: 'unavailable' });
  });
});

async function runtimeCounts(
  fixture: LearningRuntimeFixture,
  organizationId: string,
) {
  return {
    checkpoints: await fixture.first.prisma.contentLearningCheckpoint.count({
      where: { organizationId, isDeleted: false },
    }),
    baselines: await fixture.first.prisma.contentLearningBaseline.count({
      where: { organizationId, isDeleted: false },
    }),
    accounts: await fixture.first.prisma.contentLearningAccount.findMany({
      where: { organizationId, isDeleted: false },
      select: { id: true, evidenceRevision: true, epoch: true },
    }),
  };
}
