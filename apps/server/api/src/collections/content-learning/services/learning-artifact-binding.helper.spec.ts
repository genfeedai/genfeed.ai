import {
  bindLearningPublicationV1,
  learningArtifactHashV1,
} from '@api/collections/content-learning/services/learning-artifact-binding.helper';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { resolveLearningPublicationSourceV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import {
  learningDescriptorTuple,
  learningRegisteredProfiles,
} from '@genfeedai/harness';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/content-learning/services/learning-publication-source.helper',
  () => ({ resolveLearningPublicationSourceV1: vi.fn() }),
);
const resolveSource = vi.mocked(resolveLearningPublicationSourceV1);

const material = {
  text: 'First line\nSecond line',
  ingredients: [{ id: 'ingredient', version: '2' }],
  credentialId: 'credential',
  format: 'text',
  objective: 'awareness',
};
describe('learningArtifactHashV1', () => {
  it('is independent of caller key order and normalizes CRLF only', () => {
    const hash = learningArtifactHashV1(material);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      learningArtifactHashV1({
        objective: 'awareness',
        format: 'text',
        credentialId: 'credential',
        ingredients: [{ version: '2', id: 'ingredient' }],
        text: 'First line\r\nSecond line',
      }),
    ).toBe(hash);
    expect(
      learningArtifactHashV1({ ...material, text: ' First line\nSecond line' }),
    ).not.toBe(hash);
  });
  it('binds ingredient order and version', () => {
    const two = [
      { id: 'a', version: '1' },
      { id: 'b', version: '1' },
    ];
    expect(learningArtifactHashV1({ ...material, ingredients: two })).not.toBe(
      learningArtifactHashV1({ ...material, ingredients: [...two].reverse() }),
    );
    expect(
      learningArtifactHashV1({
        ...material,
        ingredients: [{ id: 'ingredient', version: '3' }],
      }),
    ).not.toBe(learningArtifactHashV1(material));
  });
});

function publicationFixture() {
  const descriptor = learningRegisteredProfiles(
      'twitter',
      'text',
      'awareness',
    )[0].descriptor,
    descriptorHash = learningHash(learningDescriptorTuple(descriptor));
  const decision = {
    id: 'decision',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    generationId: 'post',
    cellDescriptor: descriptor as unknown,
    descriptorHash: descriptorHash as string | null,
    finalArtifactHash: learningArtifactHashV1(material) as string | null,
    state: 'generated',
    censorshipReason: null as string | null,
    epoch: 2,
    accountRevision: 4,
  };
  const post = {
    id: 'post',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    description: 'First line\nSecond line',
    format: 'standard',
    parentId: null as string | null,
    learningDecisionId: null as string | null,
    publishApprovalId: 'approval' as string | null,
    ingredients: [{ id: 'ingredient', version: 2 }],
  };
  const account = { epoch: 2, revision: 4 };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningDecision: {
      findMany: vi.fn().mockImplementation(() => [decision]),
      findFirst: vi.fn().mockImplementation(() => decision),
      updateMany: vi
        .fn()
        .mockImplementation(
          ({ data }: Prisma.ContentLearningDecisionUpdateManyArgs) => {
            Object.assign(decision, data);
            return { count: 1 };
          },
        ),
    },
    post: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: Prisma.PostWhereInput }) =>
          where.learningDecisionId ? null : post,
        ),
      updateMany: vi
        .fn()
        .mockImplementation(({ data }: Prisma.PostUpdateManyArgs) => {
          Object.assign(post, data);
          return { count: 1 };
        }),
    },
    postPublishFinalization: {
      findFirst: vi.fn().mockResolvedValue({ id: 'finalization' }),
    },
    contentLearningAccount: { findFirst: vi.fn().mockResolvedValue(account) },
    publishApproval: {
      findFirst: vi.fn().mockResolvedValue({ status: 'published' }),
    },
  };
  const client = {
    contentLearningDecision: {
      findFirst: vi.fn().mockResolvedValue({ id: 'decision' }),
    },
    $transaction: vi
      .fn()
      .mockImplementation((run: (client: typeof tx) => Promise<unknown>) =>
        run(tx),
      ),
  };
  return { client, tx, decision, post, account };
}
describe('bindLearningPublicationV1', () => {
  beforeEach(() => {
    resolveSource.mockReset();
    resolveSource.mockResolvedValue({} as never);
  });
  it('opens no transaction when no decision generated the post', async () => {
    const f = publicationFixture();
    f.client.contentLearningDecision.findFirst.mockResolvedValue(null);
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'not_applicable',
      reason: 'no_decision',
    });
    expect(f.client.contentLearningDecision.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org', generationId: 'post', isDeleted: false },
      select: { id: true },
    });
    expect(f.client.$transaction).not.toHaveBeenCalled();
  });
  it('binds after shared fence and decision then post locks', async () => {
    const f = publicationFixture();
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'bound',
    });
    const sql = f.tx.$queryRaw.mock.calls.map(([parts]) => parts.join(''));
    expect(sql[0]).toContain('pg_advisory_xact_lock_shared(5728, 1)');
    expect(sql[1]).toContain('pg_advisory_xact_lock_shared(::int, hashtext(');
    expect(f.tx.$queryRaw.mock.calls[1].slice(1)).toEqual([5729, 'org']);
    expect(sql[2]).toContain('FROM content_learning_decisions');
    expect(sql[3]).toContain('FROM posts');
    expect(f.tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      f.tx.post.findFirst.mock.invocationCallOrder[0],
    );
    expect(f.tx.contentLearningDecision.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        generationId: 'post',
        isDeleted: false,
        synthetic: false,
      },
      take: 2,
    });
    expect(f.tx.contentLearningAccount.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'credential',
        isDeleted: false,
      },
    });
    expect(f.tx.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'post', organizationId: 'org', isDeleted: false },
      data: { learningDecisionId: 'decision' },
    });
    expect(f.decision.state).toBe('published');
  });
  it('replays an existing binding without writes', async () => {
    const f = publicationFixture();
    await bindLearningPublicationV1(f.client, 'org', 'post');
    f.tx.post.updateMany.mockClear();
    f.tx.contentLearningDecision.updateMany.mockClear();
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'bound',
    });
    expect(f.tx.post.updateMany).not.toHaveBeenCalled();
    expect(f.tx.contentLearningDecision.updateMany).not.toHaveBeenCalled();
  });
  it('waits for finalization without writing', async () => {
    const f = publicationFixture();
    f.tx.postPublishFinalization.findFirst.mockResolvedValue(null);
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'not_applicable',
      reason: 'finalization_pending',
    });
    expect(f.tx.contentLearningDecision.updateMany).not.toHaveBeenCalled();
    expect(f.tx.post.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    'publication_unapproved',
    'format_changed',
    'invalid_lineage',
    'artifact_unbound',
    'edited_artifact',
    'lineage_conflict',
    'invalidated_after_dispatch',
  ])('censors %s without binding the post', async (reason) => {
    const f = publicationFixture();
    if (reason === 'publication_unapproved')
      resolveSource.mockResolvedValue(null);
    if (reason === 'format_changed') f.post.parentId = 'parent';
    if (reason === 'invalid_lineage') f.decision.descriptorHash = 'other';
    if (reason === 'artifact_unbound') f.decision.finalArtifactHash = null;
    if (reason === 'edited_artifact') f.post.description = 'Edited';
    if (reason === 'lineage_conflict') f.post.learningDecisionId = 'other';
    if (reason === 'invalidated_after_dispatch') f.account.revision++;
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'censored',
      reason,
    });
    expect(f.tx.contentLearningDecision.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['decision'] },
        organizationId: 'org',
        isDeleted: false,
        state: { in: ['pending', 'generated'] },
      },
      data: { state: 'censored', censorshipReason: reason },
    });
    expect(f.tx.post.updateMany).not.toHaveBeenCalled();
  });
  it.each(['approved', 'queued', 'executing'])(
    'waits without writing while the approval is still %s',
    async (status) => {
      const f = publicationFixture();
      resolveSource.mockResolvedValue(null);
      f.tx.publishApproval.findFirst.mockResolvedValue({ status });
      expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
        status: 'not_applicable',
        reason: 'approval_pending',
      });
      expect(f.tx.publishApproval.findFirst).toHaveBeenCalledWith({
        where: { id: 'approval', organizationId: 'org', postId: 'post' },
        select: { status: true },
      });
      expect(f.tx.contentLearningDecision.updateMany).not.toHaveBeenCalled();
      expect(f.tx.post.updateMany).not.toHaveBeenCalled();
    },
  );
  it('binds on the retry after the approval completes', async () => {
    const f = publicationFixture();
    resolveSource.mockResolvedValueOnce(null);
    f.tx.publishApproval.findFirst.mockResolvedValueOnce({
      status: 'executing',
    });
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'not_applicable',
      reason: 'approval_pending',
    });
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'bound',
    });
    expect(f.decision.state).toBe('published');
  });
  it.each(['failed', 'cancelled', 'invalidated'])(
    'censors a %s approval as unapproved',
    async (status) => {
      const f = publicationFixture();
      resolveSource.mockResolvedValue(null);
      f.tx.publishApproval.findFirst.mockResolvedValue({ status });
      expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
        status: 'censored',
        reason: 'publication_unapproved',
      });
    },
  );
  it('checks censor reasons in plan order', async () => {
    const f = publicationFixture();
    resolveSource.mockResolvedValue(null);
    f.post.description = 'Edited';
    f.account.revision++;
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'censored',
      reason: 'publication_unapproved',
    });
  });
  it('censors every decision when two claim the same post', async () => {
    const f = publicationFixture();
    f.tx.contentLearningDecision.findMany.mockResolvedValue([
      f.decision,
      { ...f.decision, id: 'twin' },
    ]);
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'censored',
      reason: 'lineage_conflict',
    });
    expect(f.tx.contentLearningDecision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['decision', 'twin'] } }),
      }),
    );
  });
  it('reports an already censored decision without writing', async () => {
    const f = publicationFixture();
    f.decision.state = 'censored';
    f.decision.censorshipReason = 'edited_artifact';
    expect(await bindLearningPublicationV1(f.client, 'org', 'post')).toEqual({
      status: 'censored',
      reason: 'edited_artifact',
    });
    expect(f.tx.contentLearningDecision.updateMany).not.toHaveBeenCalled();
  });
});
