import {
  learningOrgFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { resolveLearningPublicationSourceV1 } from '@api/collections/content-learning/services/learning-publication-source.helper';
import { PublishApprovalStatus } from '@genfeedai/contracts';
import {
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import type { ContentLearningDecision, Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

export interface LearningArtifactMaterialV1 {
  text: string;
  ingredients: ReadonlyArray<{ id: string; version: string }>;
  credentialId: string;
  format: string;
  objective: string;
}
export type LearningPublicationBindingV1 =
  | { status: 'bound' }
  | { status: 'censored'; reason: string }
  | {
      status: 'not_applicable';
      reason: 'no_decision' | 'finalization_pending' | 'approval_pending';
    };
export interface LearningBindingClient {
  contentLearningDecision: Pick<
    Prisma.TransactionClient['contentLearningDecision'],
    'findFirst'
  >;
  $transaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
}
const BINDABLE_STATES = ['pending', 'generated'];
/** Approval states that can still complete as PUBLISHED. */
const IN_FLIGHT_APPROVAL_STATES: string[] = [
  PublishApprovalStatus.APPROVED,
  PublishApprovalStatus.QUEUED,
  PublishApprovalStatus.EXECUTING,
];
export const learningArtifactPostSelect = {
  id: true,
  organizationId: true,
  brandId: true,
  credentialId: true,
  description: true,
  format: true,
  parentId: true,
  learningDecisionId: true,
  publishApprovalId: true,
  ingredients: {
    where: { isDeleted: false },
    select: { id: true, version: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PostSelect;
export type LearningArtifactPostRow = Prisma.PostGetPayload<{
  select: typeof learningArtifactPostSelect;
}>;

/**
 * Learning artifact identity. Distinct from branded `sha256:` hashes and the
 * publication pin `contentDigest`; never compare across them.
 */
export function learningArtifactHashV1(
  material: LearningArtifactMaterialV1,
): string {
  return learningHash({
    text: material.text.replace(/\r\n/g, '\n'),
    ingredients: material.ingredients.map(({ id, version }) => ({
      id,
      version,
    })),
    credentialId: material.credentialId,
    format: material.format,
    objective: material.objective,
  });
}
export function learningDecisionDescriptorValid(
  decision: Pick<ContentLearningDecision, 'cellDescriptor' | 'descriptorHash'>,
): boolean {
  return (
    validLearningDescriptor(decision.cellDescriptor) &&
    !!decision.descriptorHash &&
    learningHash(learningDescriptorTuple(decision.cellDescriptor)) ===
      decision.descriptorHash
  );
}
export function learningPostArtifactHashV1(
  post: LearningArtifactPostRow,
  decision: Pick<ContentLearningDecision, 'cellDescriptor'>,
): string | null {
  const descriptor = decision.cellDescriptor;
  if (!post.credentialId || !validLearningDescriptor(descriptor)) return null;
  return learningArtifactHashV1({
    text: post.description,
    ingredients: post.ingredients.map(({ id, version }) => ({
      id,
      version: String(version),
    })),
    credentialId: post.credentialId,
    format: descriptor.format,
    objective: descriptor.objective,
  });
}

/** Binds the persisted draft artifact to the decision that generated it. */
export async function bindLearningArtifactV1(
  client: LearningBindingClient,
  organizationId: string,
  decisionId: string,
  postId: string,
  generatedText: string,
): Promise<string> {
  return client.$transaction(async (tx) => {
    await learningOrgFence(tx, organizationId, 'shared');
    await tx.$queryRaw`SELECT id FROM content_learning_decisions WHERE id = ${decisionId} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
    const decision = await tx.contentLearningDecision.findFirst({
      where: {
        id: decisionId,
        organizationId,
        isDeleted: false,
        synthetic: false,
      },
    });
    if (
      !decision ||
      decision.generationId !== postId ||
      !learningDecisionDescriptorValid(decision)
    )
      throw new ConflictException('Decision artifact mismatch');
    const post = await tx.post.findFirst({
      where: {
        id: postId,
        organizationId,
        brandId: decision.brandId,
        credentialId: decision.credentialId,
        isDeleted: false,
      },
      select: learningArtifactPostSelect,
    });
    const hash = post ? learningPostArtifactHashV1(post, decision) : null;
    if (!post || !hash)
      throw new ConflictException('Decision artifact mismatch');
    // A user edit committed after the generated draft was saved must never be
    // attributed to generation; leave the decision unbound instead.
    if (
      post.description.replace(/\r\n/g, '\n') !==
      generatedText.replace(/\r\n/g, '\n')
    )
      throw new ConflictException('Draft changed before artifact binding');
    if (decision.finalArtifactHash && decision.finalArtifactHash !== hash)
      throw new ConflictException('Decision already bound to another artifact');
    if (!['pending', 'generated'].includes(decision.state))
      throw new ConflictException('Decision is no longer bindable');
    await tx.contentLearningDecision.updateMany({
      where: {
        id: decisionId,
        organizationId,
        isDeleted: false,
        finalArtifactHash: null,
      },
      data: { finalArtifactHash: hash, state: 'generated' },
    });
    return hash;
  });
}
async function censor(
  tx: Prisma.TransactionClient,
  organizationId: string,
  decisionIds: string[],
  reason: string,
): Promise<LearningPublicationBindingV1> {
  await tx.contentLearningDecision.updateMany({
    where: {
      id: { in: decisionIds },
      organizationId,
      isDeleted: false,
      state: { in: BINDABLE_STATES },
    },
    data: { state: 'censored', censorshipReason: reason },
  });
  return { status: 'censored', reason };
}

/**
 * Binds the decision that generated `postId` to its approved publication.
 * Lineage outcomes are returned, never thrown, so publishing is unaffected.
 */
export async function bindLearningPublicationV1(
  client: LearningBindingClient,
  organizationId: string,
  postId: string,
): Promise<LearningPublicationBindingV1> {
  const candidate = await client.contentLearningDecision.findFirst({
    where: { organizationId, generationId: postId, isDeleted: false },
    select: { id: true },
  });
  if (!candidate) return { status: 'not_applicable', reason: 'no_decision' };
  return client.$transaction(async (tx) => {
    await learningOrgFence(tx, organizationId, 'shared');
    const post = await tx.post.findFirst({
      where: { id: postId, organizationId, isDeleted: false },
      select: learningArtifactPostSelect,
    });
    if (!post?.credentialId)
      return censor(tx, organizationId, [candidate.id], 'lineage_conflict');
    const decisions = await tx.contentLearningDecision.findMany({
      where: {
        organizationId,
        brandId: post.brandId,
        credentialId: post.credentialId,
        generationId: postId,
        isDeleted: false,
        synthetic: false,
      },
      take: 2,
    });
    if (decisions.length !== 1)
      return censor(
        tx,
        organizationId,
        decisions.length ? decisions.map(({ id }) => id) : [candidate.id],
        'lineage_conflict',
      );
    const [unlocked] = decisions;
    await tx.$queryRaw`SELECT id FROM content_learning_decisions WHERE id = ${unlocked.id} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM posts WHERE id = ${postId} AND "organizationId" = ${organizationId} AND "isDeleted" = false ORDER BY id FOR UPDATE`;
    const decision = await tx.contentLearningDecision.findFirst({
      where: { id: unlocked.id, organizationId, isDeleted: false },
    });
    const locked = await tx.post.findFirst({
      where: { id: postId, organizationId, isDeleted: false },
      select: learningArtifactPostSelect,
    });
    if (!decision || !locked)
      return censor(tx, organizationId, [unlocked.id], 'lineage_conflict');
    if (
      decision.state === 'published' &&
      locked.learningDecisionId === decision.id
    )
      return { status: 'bound' };
    if (decision.state === 'censored')
      return {
        status: 'censored',
        reason: decision.censorshipReason ?? 'censored',
      };
    const finalization = await tx.postPublishFinalization.findFirst({
      where: { organizationId, postId },
      select: { id: true },
    });
    if (!finalization)
      return { status: 'not_applicable', reason: 'finalization_pending' };
    const reject = (reason: string) =>
      censor(tx, organizationId, [decision.id], reason);
    if (
      !(await resolveLearningPublicationSourceV1(tx, organizationId, postId))
    ) {
      // Scheduled publishing completes the approval after the publish
      // transition; binding is retried once the approval is PUBLISHED.
      const approval = locked.publishApprovalId
        ? await tx.publishApproval.findFirst({
            where: {
              id: locked.publishApprovalId,
              organizationId,
              postId,
            },
            select: { status: true },
          })
        : null;
      if (approval && IN_FLIGHT_APPROVAL_STATES.includes(approval.status))
        return { status: 'not_applicable', reason: 'approval_pending' };
      return reject('publication_unapproved');
    }
    if (locked.format !== 'standard' || locked.parentId !== null)
      return reject('format_changed');
    if (!learningDecisionDescriptorValid(decision))
      return reject('invalid_lineage');
    if (decision.finalArtifactHash === null) return reject('artifact_unbound');
    if (
      learningPostArtifactHashV1(locked, decision) !==
      decision.finalArtifactHash
    )
      return reject('edited_artifact');
    const elsewhere = await tx.post.findFirst({
      where: {
        organizationId,
        learningDecisionId: decision.id,
        id: { not: postId },
        isDeleted: false,
      },
      select: { id: true },
    });
    if (
      elsewhere ||
      (locked.learningDecisionId !== null &&
        locked.learningDecisionId !== decision.id)
    )
      return reject('lineage_conflict');
    const account = await tx.contentLearningAccount.findFirst({
      where: {
        organizationId,
        brandId: decision.brandId,
        credentialId: decision.credentialId,
        isDeleted: false,
      },
    });
    if (
      !account ||
      account.epoch !== decision.epoch ||
      account.revision !== decision.accountRevision
    )
      return reject('invalidated_after_dispatch');
    await tx.post.updateMany({
      where: { id: postId, organizationId, isDeleted: false },
      data: { learningDecisionId: decision.id },
    });
    await tx.contentLearningDecision.updateMany({
      where: {
        id: decision.id,
        organizationId,
        isDeleted: false,
        state: { in: BINDABLE_STATES },
      },
      data: { state: 'published' },
    });
    return { status: 'bound' };
  });
}
