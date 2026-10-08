import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
} from '@genfeedai/contracts';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  captureLearningLoopPublication as capturePublication,
  closeLearningLoopDatabase,
  enableLegacyLearningLoopLive,
  ensureLearningLoopScope,
  type LearningLoopDatabase,
  type LearningLoopPublication,
  type LearningLoopTarget,
  openLearningLoopDatabase,
  publishLearningLoopPost,
  seedLearningLoopTenant,
} from './content-learning-loop.fixture';

// Real PostgreSQL, owned schema, production services: the generate → bind →
// publish → capture → reward loop that feeds the next generation (#5788).
describe('Content learning generation loop (real Postgres)', () => {
  let database: LearningLoopDatabase | undefined;
  let target: LearningLoopTarget;
  let scope: Awaited<ReturnType<typeof ensureLearningLoopScope>>;
  let other: LearningLoopTarget;

  const db = () => {
    if (!database) throw new Error('database not open');
    return database;
  };
  const captureLearningLoopPublication = (
    database: LearningLoopDatabase,
    publication: LearningLoopPublication,
  ) => {
    vi.setSystemTime(
      new Date(publication.publishedAt.getTime() + (48 * 60 + 10) * 60000),
    );
    return capturePublication(database, publication);
  };
  const draft = async (description: string) => {
    const id = randomUUID();
    await db().prisma.post.create({
      data: {
        id,
        description,
        userId: target.actorId,
        organizationId: target.organizationId,
        brandId: target.brandId,
        credentialId: target.credentialId,
        platform: Platform.TWITTER,
        category: PostCategory.TEXT,
        format: PostFormat.STANDARD,
        timezone: 'UTC',
        targetAttachments: [],
        targetSettings: {},
        visibility: PostVisibility.PUBLIC,
      },
    });
    return id;
  };
  const resolve = async (generationId: string) => {
    const [resolution] =
      await db().services.decisions.resolveBatchForGeneration({
        organizationId: target.organizationId,
        brandId: target.brandId,
        format: 'text',
        harnessEnabled: true,
        compatible: true,
        originalPrompt: 'Launch day',
        context: {
          credentialId: target.credentialId,
          objective: 'awareness',
          requestKey: randomUUID(),
        },
        candidates: [{ candidateIndex: 0, generationId }],
      });
    return resolution;
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date());
    database = await openLearningLoopDatabase();
    target = await seedLearningLoopTenant(db());
    other = await seedLearningLoopTenant(db());
    scope = await ensureLearningLoopScope(db(), target);
    for (let index = 0; index < 20; index++) {
      const publication = await publishLearningLoopPost(db(), target);
      expect(
        await captureLearningLoopPublication(db(), publication),
      ).toBeTruthy();
    }
  }, 600000);

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      await closeLearningLoopDatabase(database);
    } finally {
      vi.useRealTimers();
    }
  });

  it('materializes a twenty-contributor baseline and resolves a shadow decision against it', async () => {
    const baseline = await db().services.materializer.materialize(
      scope.scope,
      scope.descriptor,
      new Date(),
    );
    expect(baseline).toMatchObject({ count: 20, validity: 'valid' });

    const postId = await draft('Shadow candidate text');
    const resolution = await resolve(postId);
    expect(resolution.receipt).toMatchObject({
      mode: 'shadow',
      synthetic: false,
    });
    // The decision freezes its own baseline from the same twenty contributors.
    const frozen = await db().prisma.contentLearningBaseline.findFirstOrThrow({
      where: {
        id: resolution.receipt.baselineId,
        organizationId: target.organizationId,
        isDeleted: false,
      },
    });
    expect(frozen).toMatchObject({ count: 20, validity: 'valid' });
    expect(new Set(frozen.contributorCheckpointIds)).toEqual(
      new Set(baseline?.contributorCheckpointIds),
    );
    expect(resolution.contribution).toEqual({});
    const decision = await db().prisma.contentLearningDecision.findFirstOrThrow(
      {
        where: {
          id: resolution.receipt.decisionId,
          organizationId: target.organizationId,
          isDeleted: false,
        },
      },
    );
    expect(decision).toMatchObject({
      generationId: postId,
      credentialId: target.credentialId,
      synthetic: false,
    });
  }, 180000);

  it('binds the generated artifact to its publication and commits a valid reward', async () => {
    const text = 'Bound candidate text';
    const postId = await draft(text);
    const resolution = await resolve(postId);
    const decisionId = resolution.receipt.decisionId as string;
    await db().services.decisions.bindArtifact(
      target.organizationId,
      decisionId,
      postId,
      text,
    );
    const publication = await publishLearningLoopPost(db(), target, {
      postId,
    });
    expect(
      await db().services.decisions.bindPublication(
        target.organizationId,
        postId,
      ),
    ).toEqual({ status: 'bound' });
    const post = await db().prisma.post.findFirstOrThrow({
      where: { id: postId, organizationId: target.organizationId },
    });
    expect(post.learningDecisionId).toBe(decisionId);
    expect(
      (
        await db().prisma.contentLearningDecision.findFirstOrThrow({
          where: { id: decisionId, organizationId: target.organizationId },
        })
      ).state,
    ).toBe('published');

    const checkpoint = await captureLearningLoopPublication(db(), publication);
    expect(checkpoint).toBeTruthy();
    const checkpointId = (checkpoint as { id: string }).id;
    const committed = await db().services.rewards.commitForCheckpoint(
      target.organizationId,
      checkpointId,
    );
    expect(committed).toMatchObject({
      status: 'committed',
      rewardStatus: 'valid',
    });
    const rewardId = (committed as { rewardId: string }).rewardId;
    for (const [sourceKind, sourceId] of [
      ['decision', decisionId],
      ['checkpoint', checkpointId],
    ] as const)
      expect(
        await db().prisma.contentLearningDependency.count({
          where: {
            derivedKind: 'reward',
            derivedId: rewardId,
            derivedOrganizationId: target.organizationId,
            sourceKind,
            sourceId,
            isDeleted: false,
            valid: true,
          },
        }),
      ).toBe(1);
    expect(
      await db().prisma.contentLearningDependency.count({
        where: {
          derivedKind: 'reward',
          derivedId: rewardId,
          derivedOrganizationId: target.organizationId,
          sourceKind: 'baseline',
          isDeleted: false,
          valid: true,
        },
      }),
    ).toBe(1);
    const policy = await db().services.policies.rebuild(
      target.organizationId,
      target.credentialId,
      scope.scope.scopeKey,
    );
    expect(policy).toMatchObject({ state: 'shadow', evidenceIds: [rewardId] });
    if (!policy) throw new Error('Expected a learned shadow policy');
    expect(
      await db().services.dependencies.valid(
        'policy',
        policy.id,
        db().prisma,
        target.organizationId,
      ),
    ).toBe(true);
    expect(
      await db().prisma.contentLearningDependency.count({
        where: {
          derivedKind: 'policy',
          derivedId: policy.id,
          derivedOrganizationId: target.organizationId,
          sourceKind: 'reward',
          sourceId: rewardId,
          valid: true,
          isDeleted: false,
        },
      }),
    ).toBe(1);
    const readScope = () =>
      db().prisma.contentLearningScopeState.findFirstOrThrow({
        where: {
          id: scope.scope.id,
          organizationId: target.organizationId,
          isDeleted: false,
        },
      });
    expect((await readScope()).activePolicyId).toBeNull();
    await enableLegacyLearningLoopLive(db(), target);
    expect((await readScope()).activePolicyId).toBeNull();
    const where = {
      organizationId: target.organizationId,
      credentialId: target.credentialId,
      scopeKey: scope.scope.scopeKey,
      epoch: scope.scope.epoch,
      isDeleted: false,
    };
    const count = await db().prisma.contentLearningPolicyVersion.count({
      where,
    });
    expect(
      await db().services.policies.rebuild(
        target.organizationId,
        target.credentialId,
        scope.scope.scopeKey,
      ),
    ).toMatchObject({
      id: policy.id,
      state: 'shadow',
      evidenceManifestHash: policy.evidenceManifestHash,
    });
    expect(
      await db().prisma.contentLearningPolicyVersion.count({ where }),
    ).toBe(count);
    expect((await readScope()).activePolicyId).toBeNull();
  }, 180000);

  it('commits no valid reward when the artifact was never bound', async () => {
    const postId = await draft('Unbound candidate text');
    const resolution = await resolve(postId);
    const binding = vi
      .spyOn(db().services.decisions, 'bindArtifact')
      .mockResolvedValue('');
    await db().services.decisions.bindArtifact(
      target.organizationId,
      resolution.receipt.decisionId as string,
      postId,
      'Unbound candidate text',
    );
    expect(binding).toHaveBeenCalledOnce();
    const publication = await publishLearningLoopPost(db(), target, {
      postId,
    });
    await db().services.decisions.bindPublication(
      target.organizationId,
      postId,
    );
    const checkpoint = await captureLearningLoopPublication(db(), publication);
    expect(
      await db().services.rewards.commitForCheckpoint(
        target.organizationId,
        (checkpoint as { id: string }).id,
      ),
    ).toEqual({ status: 'unavailable', reason: 'decision_unbound' });
  }, 180000);

  it('censors a candidate edited before approval', async () => {
    const postId = await draft('Original candidate text');
    const resolution = await resolve(postId);
    const decisionId = resolution.receipt.decisionId as string;
    await db().services.decisions.bindArtifact(
      target.organizationId,
      decisionId,
      postId,
      'Original candidate text',
    );
    await db().prisma.post.update({
      where: { id: postId },
      data: { description: 'Edited before approval' },
    });
    const publication = await publishLearningLoopPost(db(), target, {
      postId,
    });
    expect(
      await db().services.decisions.bindPublication(
        target.organizationId,
        postId,
      ),
    ).toMatchObject({ status: 'censored', reason: 'edited_artifact' });
    const checkpoint = await captureLearningLoopPublication(db(), publication);
    expect(
      await db().services.rewards.commitForCheckpoint(
        target.organizationId,
        (checkpoint as { id: string }).id,
      ),
    ).toEqual({ status: 'unavailable', reason: 'decision_unbound' });
    expect(
      (
        await db().prisma.contentLearningDecision.findFirstOrThrow({
          where: {
            generationId: postId,
            organizationId: target.organizationId,
          },
        })
      ).censorshipReason,
    ).toBe('edited_artifact');
  }, 180000);

  it('never exposes a decision to another organization', async () => {
    const postId = await draft('Tenant boundary candidate text');
    const resolution = await resolve(postId);
    const decisionId = resolution.receipt.decisionId as string;
    expect(
      await db().prisma.contentLearningDecision.findFirst({
        where: {
          id: decisionId,
          organizationId: other.organizationId,
          isDeleted: false,
        },
      }),
    ).toBeNull();
    expect(
      await db().services.decisions.bindPublication(
        other.organizationId,
        postId,
      ),
    ).toMatchObject({ status: 'not_applicable' });
  }, 180000);
});
