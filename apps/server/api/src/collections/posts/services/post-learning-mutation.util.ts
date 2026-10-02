import { isDeepStrictEqual } from 'node:util';
import {
  projectPostArtifactMaterial,
  readArtifactRecord,
} from '@api/agent-artifacts/agent-artifact-material.util';
import {
  invalidateLearningDependencySource,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningPublicationApprovalSelect,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { preparePostPatchWrite } from '@api/collections/posts/services/post-patch-write.util';
import type { PostUpdateInput } from '@api/collections/posts/services/posts.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import type { PopulateInput } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { TargetExecutionState } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  getTenantContext,
  isCrossOrgUnsafe,
} from '@libs/prisma/tenant-context';
import { BadRequestException, ConflictException } from '@nestjs/common';

type PostRow = Prisma.PostGetPayload<{
  select: typeof learningPublicationPostSelect;
}>;
type ApprovalRow = Prisma.PublishApprovalGetPayload<{
  select: typeof learningPublicationApprovalSelect;
}>;
type AccountRow = Prisma.ContentLearningAccountGetPayload<{
  select: { id: true; organizationId: true; brandId: true; credentialId: true };
}>;
type Scope = {
  organizationId: string;
  brandId: string | null;
  credentialId: string | null;
};
type PostPlan = {
  organizationId: string;
  id: string;
  rows: PostRow[];
  childIds: string[];
  scopes: Scope[];
  accounts: AccountRow[];
  approvals: ApprovalRow[];
  pins: { id: string }[];
  finalizations: { id: string }[];
};
type PostSnapshot = {
  row: PostRow;
  material: ReturnType<typeof projectPostArtifactMaterial>;
};
export type PostLearningMutationContext = {
  logger: Pick<LoggerService, 'log'>;
  publishApprovalsService?: Pick<
    PublishApprovalsService,
    'assertPostMutable' | 'invalidatePost'
  >;
  createPost: (
    tx: Prisma.TransactionClient,
    data: Record<string, unknown>,
    populate: PopulateInput,
  ) => Promise<PostDocument>;
  readPost: (
    tx: Prisma.TransactionClient,
    where: Prisma.PostWhereInput & { organizationId: string; isDeleted: false },
    populate: PopulateInput,
  ) => Promise<PostDocument | null>;
  writePost: (
    tx: Prisma.TransactionClient,
    where: Prisma.PostWhereUniqueInput & {
      organizationId: string;
      isDeleted: false;
    },
    data: Record<string, unknown>,
    populate: PopulateInput,
  ) => Promise<PostDocument>;
};
export type PostLearningPatchResult = {
  updatedPost: PostDocument;
  currentPost: PostDocument | null;
  isPublishingPost: boolean;
  logs: Parameters<LoggerService['log']>[];
  afterCommit: (() => void)[];
};
export type PostLearningRemoveResult = {
  deletedPost: PostDocument;
  childrenDeleted: number;
};
const accountSelect = {
  id: true,
  organizationId: true,
  brandId: true,
  credentialId: true,
} as const;

async function discoverPostTargetScope(
  tx: Prisma.TransactionClient,
  current: PostRow,
  dto: PostUpdateInput,
): Promise<Scope> {
  if (
    dto.organizationId !== undefined &&
    dto.organizationId !== current.organizationId
  )
    throw new BadRequestException(
      'Use authorized brand relocation to change organizations.',
    );
  const brandId = dto.brandId === undefined ? current.brandId : dto.brandId;
  const credentialId =
    dto.credentialId === undefined ? current.credentialId : dto.credentialId;
  if (brandId !== current.brandId && brandId) {
    const brand = await tx.brand.findFirst({
      where: {
        id: brandId,
        organizationId: current.organizationId,
        isActive: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!brand)
      throw new BadRequestException(
        'The selected post brand is unavailable in this organization.',
      );
  }
  if (
    (credentialId !== current.credentialId || brandId !== current.brandId) &&
    credentialId
  ) {
    const credential = await tx.credential.findFirst({
      where: {
        id: credentialId,
        ...(brandId ? { brandId } : {}),
        organizationId: current.organizationId,
        isConnected: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!credential)
      throw new BadRequestException(
        'The selected publishing credential is unavailable for this brand.',
      );
  }
  return { organizationId: current.organizationId, brandId, credentialId };
}
async function assertChildCreateScope(
  tx: Prisma.TransactionClient,
  parent: PostRow,
  scope: Scope,
): Promise<void> {
  if (
    parent.organizationId !== scope.organizationId ||
    parent.brandId !== scope.brandId
  )
    throw new BadRequestException(
      'A child post must retain its parent organization and brand.',
    );
  if (scope.credentialId && scope.credentialId !== parent.credentialId) {
    const credential = await tx.credential.findFirst({
      where: {
        id: scope.credentialId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isConnected: true,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!credential)
      throw new BadRequestException(
        'The selected child credential is unavailable for this brand.',
      );
  }
}
async function discoverPostMutation(
  tx: Prisma.TransactionClient,
  id: string,
  dto: PostUpdateInput,
  remove: boolean,
  organizationId?: string,
  createScope?: Scope,
): Promise<PostPlan | null> {
  organizationId ??= isCrossOrgUnsafe()
    ? undefined
    : getTenantContext()?.organizationId;
  // tenant-scope-ignore: no-context system callers retain exact ID discovery; active request tenants are explicitly fenced below.
  const current = await tx.post.findFirst({
    where: {
      id,
      isDeleted: false,
      ...(organizationId ? { organizationId } : {}),
    },
    select: learningPublicationPostSelect,
  });
  if (!current) return null;
  if (createScope) await assertChildCreateScope(tx, current, createScope);
  const { brandId, credentialId } = await discoverPostTargetScope(
    tx,
    current,
    dto,
  );
  const children =
    remove ||
    (dto.targetExecutionState === TargetExecutionState.SCHEDULED &&
      !current.parentId)
      ? await tx.post.findMany({
          where: {
            parentId: id,
            ...(!remove
              ? {
                  targetExecutionState: { not: TargetExecutionState.PUBLISHED },
                }
              : {}),
            organizationId: current.organizationId,
            isDeleted: false,
          },
          select: learningPublicationPostSelect,
          orderBy: { id: 'asc' },
        })
      : [];
  const parentIds = [
    ...new Set(
      [current.parentId, dto.parentId].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      ),
    ),
  ];
  const parents = parentIds.length
    ? await tx.post.findMany({
        where: {
          id: { in: parentIds },
          organizationId: current.organizationId,
          isDeleted: false,
        },
        select: learningPublicationPostSelect,
      })
    : [];
  if (
    dto.parentId &&
    !parents.some((row) => row.id === dto.parentId && row.brandId === brandId)
  )
    throw new BadRequestException(
      'The selected parent post is unavailable for this brand.',
    );
  const rows = [
    ...new Map(
      [current, ...children, ...parents].map((row) => [row.id, row]),
    ).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const scopes: Scope[] = [
    ...rows.map((row) => ({
      organizationId: row.organizationId,
      brandId: row.brandId,
      credentialId: row.credentialId,
    })),
    { organizationId: current.organizationId, brandId, credentialId },
    ...(createScope ? [createScope] : []),
  ];
  if (!remove)
    scopes.push(
      ...children.map((row) => ({
        organizationId: row.organizationId,
        brandId: row.brandId,
        credentialId: dto.credentialId ?? current.credentialId,
      })),
    );
  const accountScopes = scopes
    .filter((scope) => scope.brandId && scope.credentialId)
    .map((scope) => ({
      organizationId: scope.organizationId,
      brandId: scope.brandId as string,
      credentialId: scope.credentialId as string,
    }));
  const accounts = accountScopes.length
    ? await tx.contentLearningAccount.findMany({
        where: {
          OR: accountScopes,
          organizationId: {
            in: accountScopes.map((scope) => scope.organizationId),
          },
          isDeleted: false,
        },
        select: accountSelect,
        orderBy: { id: 'asc' },
      })
    : [];
  const postIds = rows.map((row) => row.id);
  const approvals = await tx.publishApproval.findMany({
    where: { organizationId: current.organizationId, postId: { in: postIds } },
    select: learningPublicationApprovalSelect,
    orderBy: { id: 'asc' },
  });
  const pinIds = [
    ...new Set([
      ...rows.flatMap((row) =>
        row.reviewVersionPinId ? [row.reviewVersionPinId] : [],
      ),
      ...approvals.map((row) => row.artifactVersionPinId),
    ]),
  ];
  // tenant-scope-ignore: immutable pin and finalization models lack soft-delete semantics; exact source organization and selected references are retained.
  const pins = await tx.contentVersionPin.findMany({
    where: { organizationId: current.organizationId, id: { in: pinIds } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const finalizations = await tx.postPublishFinalization.findMany({
    where: { organizationId: current.organizationId, postId: { in: postIds } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return {
    organizationId: current.organizationId,
    id,
    rows,
    childIds: children.map((row) => row.id),
    scopes,
    accounts,
    approvals,
    pins,
    finalizations,
  };
}
async function lockPostMutationAccounts(
  tx: Prisma.TransactionClient,
  plan: PostPlan,
): Promise<void> {
  for (const account of plan.accounts) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "content_learning_accounts" WHERE "id" = ${account.id} AND "organizationId" = ${account.organizationId} AND "brandId" = ${account.brandId} AND "credentialId" = ${account.credentialId} AND "isDeleted" = false FOR UPDATE`,
    );
    if (rows.length !== 1)
      throw new ConflictException(
        'Learning account scope changed during post mutation.',
      );
  }
}
async function lockPostMutationSources(
  tx: Prisma.TransactionClient,
  plan: PostPlan,
  dto: PostUpdateInput,
  remove: boolean,
  createScope?: Scope,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "organizations" WHERE "id" = ${plan.organizationId} AND "isDeleted" = false FOR UPDATE`,
  );
  for (const id of [
    ...new Set(
      plan.scopes.flatMap((scope) => (scope.brandId ? [scope.brandId] : [])),
    ),
  ].sort())
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${id} AND "organizationId" = ${plan.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
  for (const id of [
    ...new Set(
      plan.scopes.flatMap((scope) =>
        scope.credentialId ? [scope.credentialId] : [],
      ),
    ),
  ].sort())
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "credentials" WHERE "id" = ${id} AND "organizationId" = ${plan.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
  for (const row of plan.rows)
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "posts" WHERE "id" = ${row.id} AND "organizationId" = ${plan.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
  for (const row of plan.approvals)
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "publish_approvals" WHERE "id" = ${row.id} AND "organizationId" = ${plan.organizationId} FOR UPDATE`,
    );
  for (const row of plan.pins)
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "content_version_pins" WHERE "id" = ${row.id} AND "organizationId" = ${plan.organizationId} FOR UPDATE`,
    );
  for (const row of plan.finalizations)
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "post_publish_finalizations" WHERE "id" = ${row.id} AND "organizationId" = ${plan.organizationId} FOR UPDATE`,
    );
  const current = await discoverPostMutation(
    tx,
    plan.id,
    dto,
    remove,
    plan.organizationId,
    createScope,
  );
  const identities = (value: PostPlan) => ({
    rows: value.rows.map((row) => ({
      id: row.id,
      brandId: row.brandId,
      credentialId: row.credentialId,
      parentId: row.parentId,
      targetExecutionState: row.targetExecutionState,
    })),
    childIds: value.childIds,
    scopes: value.scopes,
    accounts: value.accounts,
    approvals: value.approvals.map((row) => row.id),
    pins: value.pins,
    finalizations: value.finalizations,
  });
  if (!current || !isDeepStrictEqual(identities(current), identities(plan)))
    throw new ConflictException(
      'Post source discovery changed during mutation.',
    );
  plan.rows = current.rows;
  plan.approvals = current.approvals;
}
async function readPostMutationSnapshots(
  tx: Prisma.TransactionClient,
  plan: PostPlan,
): Promise<PostSnapshot[]> {
  const snapshots: PostSnapshot[] = [];
  for (const row of plan.rows) {
    // tenant-scope-ignore: exact original-org tombstone read is required after owned soft deletion.
    const current = await tx.post.findFirst({
      where: { id: row.id, organizationId: plan.organizationId },
      select: { ...learningPublicationPostSelect, ingredients: true },
    });
    if (!current) throw new ConflictException('Post vanished during mutation.');
    const { ingredients, ...canonical } = current;
    snapshots.push({
      row: canonical,
      material: projectPostArtifactMaterial(
        readArtifactRecord({ ...canonical, ingredients }),
      ),
    });
  }
  return snapshots;
}
async function invalidateChangedPostSources(
  tx: Prisma.TransactionClient,
  plan: PostPlan,
  before: PostSnapshot[],
  approvalsBefore: ApprovalRow[],
): Promise<void> {
  const after = await readPostMutationSnapshots(tx, plan),
    changedScopes: Scope[] = [];
  for (let index = 0; index < before.length; index++)
    if (!isDeepStrictEqual(before[index], after[index])) {
      await invalidateLearningDependencySource(
        tx,
        'post',
        before[index].row.id,
        plan.organizationId,
      );
      changedScopes.push(before[index].row, after[index].row);
    }
  const approvals = await tx.publishApproval.findMany({
    where: {
      organizationId: plan.organizationId,
      id: { in: approvalsBefore.map((row) => row.id) },
    },
    select: learningPublicationApprovalSelect,
    orderBy: { id: 'asc' },
  });
  for (let index = 0; index < approvalsBefore.length; index++)
    if (!isDeepStrictEqual(approvalsBefore[index], approvals[index])) {
      await invalidateLearningDependencySource(
        tx,
        'publish_approval',
        approvalsBefore[index].id,
        plan.organizationId,
      );
      const post = plan.rows.find(
        (row) => row.id === approvalsBefore[index].postId,
      );
      if (post) changedScopes.push(post);
    }
  for (const account of plan.accounts.filter((account) =>
    changedScopes.some(
      (scope) =>
        scope.organizationId === account.organizationId &&
        scope.brandId === account.brandId &&
        scope.credentialId === account.credentialId,
    ),
  )) {
    const result = await tx.contentLearningAccount.updateMany({
      where: scopedWhere(account.organizationId, account),
      data: { evidenceRevision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Learning account changed during post invalidation.',
      );
  }
}
async function preparePostMutation(
  tx: Prisma.TransactionClient,
  id: string,
  dto: PostUpdateInput,
  remove: boolean,
): Promise<PostPlan | null> {
  await learningFence(tx, 'exclusive');
  const plan = await discoverPostMutation(tx, id, dto, remove);
  if (!plan) return null;
  await lockPostMutationAccounts(tx, plan);
  await lockPostMutationSources(tx, plan, dto, remove);
  return plan;
}
export async function patchPostWithLearning(
  tx: Prisma.TransactionClient,
  context: PostLearningMutationContext,
  id: string,
  dto: PostUpdateInput,
  populate: PopulateInput,
): Promise<PostLearningPatchResult> {
  const plan = await preparePostMutation(tx, id, dto, false);
  if (!plan) throw new NotFoundException('Post', id);
  const before = await readPostMutationSnapshots(tx, plan),
    logs: PostLearningPatchResult['logs'] = [],
    afterCommit: (() => void)[] = [];
  const currentSource = plan.rows.find((row) => row.id === id);
  for (const row of plan.rows)
    if (
      (row.id === id || plan.childIds.includes(row.id)) &&
      row.publishApprovalId &&
      context.publishApprovalsService
    )
      await context.publishApprovalsService.assertPostMutable(
        plan.organizationId,
        row.id,
        tx,
      );
  const prepared = await preparePostPatchWrite(
    {
      prisma: tx,
      transaction: tx,
      organizationId: plan.organizationId,
      childIds: plan.childIds,
      logger: { log: (...args) => logs.push(args) },
      findOne: (where) =>
        context.readPost(
          tx,
          { ...where, organizationId: plan.organizationId, isDeleted: false },
          [PopulatePatterns.ingredientsMinimal],
        ),
    },
    id,
    dto,
  );
  let updatedPost = await context.writePost(
    tx,
    { id, organizationId: plan.organizationId, isDeleted: false },
    prepared.prismaWriteData,
    populate,
  );
  const afterWrite = await readPostMutationSnapshots(tx, plan);
  const index = before.findIndex((value) => value.row.id === id);
  if (
    currentSource?.publishApprovalId &&
    context.publishApprovalsService &&
    !isDeepStrictEqual(
      {
        material: before[index].material,
        format: before[index].row.format,
        visibility: before[index].row.visibility,
        executionState: before[index].row.targetExecutionState,
      },
      {
        material: afterWrite[index].material,
        format: afterWrite[index].row.format,
        visibility: afterWrite[index].row.visibility,
        executionState: afterWrite[index].row.targetExecutionState,
      },
    )
  ) {
    await context.publishApprovalsService.invalidatePost(
      plan.organizationId,
      id,
      'Canonical Post material or protected schedule intent changed.',
      undefined,
      tx,
      (emit) => afterCommit.push(emit),
    );
    const final = await context.readPost(
      tx,
      { id, organizationId: plan.organizationId, isDeleted: false },
      populate,
    );
    if (!final)
      throw new ConflictException('Post vanished after approval invalidation.');
    updatedPost = final;
  }
  await invalidateChangedPostSources(tx, plan, before, plan.approvals);
  return {
    updatedPost,
    currentPost: prepared.currentPost,
    isPublishingPost: prepared.isPublishingPost,
    logs,
    afterCommit,
  };
}
export async function removePostWithLearning(
  tx: Prisma.TransactionClient,
  context: PostLearningMutationContext,
  id: string,
): Promise<PostLearningRemoveResult | null> {
  const plan = await preparePostMutation(tx, id, {}, true);
  if (!plan) return null;
  const before = await readPostMutationSnapshots(tx, plan);
  const children = await tx.post.updateMany({
    where: {
      id: { in: plan.childIds },
      parentId: id,
      organizationId: plan.organizationId,
      isDeleted: false,
    },
    data: { isDeleted: true },
  });
  if (children.count !== plan.childIds.length)
    throw new ConflictException('Post child set changed during deletion.');
  const deletedPost = await context.writePost(
    tx,
    { id, organizationId: plan.organizationId, isDeleted: false },
    { isDeleted: true },
    [],
  );
  await invalidateChangedPostSources(tx, plan, before, plan.approvals);
  return { deletedPost, childrenDeleted: children.count };
}

export async function createPostChildWithLearning(
  tx: Prisma.TransactionClient,
  context: PostLearningMutationContext,
  preparedData: Record<string, unknown>,
  populate: PopulateInput,
): Promise<{ createdPost: PostDocument; afterCommit: (() => void)[] }> {
  await learningFence(tx, 'exclusive');
  const { parentId, organizationId, brandId, credentialId } = preparedData;
  if (
    typeof parentId !== 'string' ||
    !parentId ||
    typeof organizationId !== 'string' ||
    !organizationId
  )
    throw new BadRequestException(
      'Child creation requires an exact parent and organization.',
    );
  if (
    (brandId !== undefined &&
      brandId !== null &&
      typeof brandId !== 'string') ||
    (credentialId !== undefined &&
      credentialId !== null &&
      typeof credentialId !== 'string')
  )
    throw new BadRequestException(
      'Child creation requires canonical brand and credential identities.',
    );
  const scope: Scope = {
    organizationId,
    brandId: brandId ?? null,
    credentialId: credentialId ?? null,
  };
  const plan = await discoverPostMutation(
    tx,
    parentId,
    {},
    false,
    organizationId,
    scope,
  );
  if (!plan) throw new NotFoundException('Post', parentId);
  await lockPostMutationAccounts(tx, plan);
  await lockPostMutationSources(tx, plan, {}, false, scope);
  const before = await readPostMutationSnapshots(tx, plan),
    afterCommit: (() => void)[] = [];
  const parent = plan.rows.find((row) => row.id === parentId);
  if (!parent)
    throw new ConflictException('Parent post vanished during child creation.');
  const protectedParent =
    plan.approvals.some((row) => row.postId === parentId) ||
    !!parent.publishApprovalId ||
    !!parent.reviewVersionPinId;
  if (protectedParent) {
    if (!context.publishApprovalsService)
      throw new ConflictException(
        'Publish approval authority is required for this parent post.',
      );
    await context.publishApprovalsService.assertPostMutable(
      organizationId,
      parentId,
      tx,
    );
  }
  const createdPost = await context.createPost(tx, preparedData, populate);
  const after = await readPostMutationSnapshots(tx, plan);
  const original = before.find((value) => value.row.id === parentId),
    current = after.find((value) => value.row.id === parentId);
  if (!original || !current)
    throw new ConflictException('Parent post vanished after child creation.');
  if (
    original.row._count.children !== current.row._count.children &&
    protectedParent
  ) {
    if (!context.publishApprovalsService)
      throw new ConflictException(
        'Publish approval authority is required for this parent post.',
      );
    await context.publishApprovalsService.invalidatePost(
      organizationId,
      parentId,
      'Post thread membership changed.',
      undefined,
      tx,
      (emit) => afterCommit.push(emit),
    );
  }
  await invalidateChangedPostSources(tx, plan, before, plan.approvals);
  return { createdPost, afterCommit };
}
