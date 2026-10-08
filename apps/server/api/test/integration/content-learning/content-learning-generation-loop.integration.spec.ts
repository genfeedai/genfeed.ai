import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
} from '@genfeedai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureLearningLoopPublication,
  closeLearningLoopDatabase,
  ensureLearningLoopScope,
  type LearningLoopDatabase,
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

  afterAll(async () => {
    await closeLearningLoopDatabase(database);
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
      baselineId: baseline?.id,
      synthetic: false,
    });
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
  }, 180000);

  it('commits no valid reward when the artifact was never bound', async () => {
    const postId = await draft('Unbound candidate text');
    await resolve(postId);
    const publication = await publishLearningLoopPost(db(), target, {
      postId,
    });
    await db().services.decisions.bindPublication(
      target.organizationId,
      postId,
    );
    const checkpoint = await captureLearningLoopPublication(db(), publication);
    const committed = await db().services.rewards.commitForCheckpoint(
      target.organizationId,
      (checkpoint as { id: string }).id,
    );
    expect(committed).toMatchObject({
      status: 'committed',
      rewardStatus: 'unavailable',
    });
    const reward = await db().prisma.contentLearningReward.findFirstOrThrow({
      where: {
        id: (committed as { rewardId: string }).rewardId,
        organizationId: target.organizationId,
      },
    });
    expect(reward.reason).toBe('decision_unbound');
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
    const committed = await db().services.rewards.commitForCheckpoint(
      target.organizationId,
      (checkpoint as { id: string }).id,
    );
    expect(committed).toMatchObject({ status: 'committed' });
    const reward = await db().prisma.contentLearningReward.findFirstOrThrow({
      where: {
        id: (committed as { rewardId: string }).rewardId,
        organizationId: target.organizationId,
      },
    });
    expect(reward.reason).toBe('decision_unbound');
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
