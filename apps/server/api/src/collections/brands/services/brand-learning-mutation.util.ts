import { isDeepStrictEqual } from 'node:util';
import {
  invalidateLearningDependencySource,
  LearningFenceEscalationError,
  type LearningMutationFenceScope,
  learningFence,
  learningMutationFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { runFencedLearningMutation } from '@api/collections/content-learning/services/learning-fenced-mutation.util';
import { learningPublicationBrandSelect } from '@api/collections/content-learning/services/learning-publication-source.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import {
  getTenantContext,
  isCrossOrgUnsafe,
} from '@libs/prisma/tenant-context';
import { BadRequestException, ConflictException } from '@nestjs/common';

type BrandRow = Prisma.BrandGetPayload<{
  select: typeof learningPublicationBrandSelect;
}>;
type AccountRow = Prisma.ContentLearningAccountGetPayload<{
  select: { id: true; organizationId: true; brandId: true; credentialId: true };
}>;
type BrandMutationInput = {
  brandId: string;
  organizationId?: string;
  destinationOrganizationId?: string;
  lockAllSourceBrands: boolean;
};
export type BrandLearningScope = {
  organizationId: string;
  brandId: string;
  accounts: AccountRow[];
  beforeBrand: BrandRow;
  organizationIds: string[];
  brandIds: string[];
};
const accountSelect = {
  id: true,
  organizationId: true,
  brandId: true,
  credentialId: true,
} as const;

async function discoverBrandLearningMutation(
  tx: Prisma.TransactionClient,
  input: BrandMutationInput,
): Promise<BrandLearningScope> {
  const organizationId =
    input.organizationId ??
    (isCrossOrgUnsafe() ? undefined : getTenantContext()?.organizationId);
  // tenant-scope-ignore: no-context system callers retain exact ID discovery; active request tenants are explicitly fenced below.
  const brand = await tx.brand.findFirst({
    where: {
      id: input.brandId,
      isDeleted: false,
      ...(organizationId ? { organizationId } : {}),
    },
    select: learningPublicationBrandSelect,
  });
  if (!brand) throw new NotFoundException('Brand', input.brandId);
  const organizationIds = [
    ...new Set([
      brand.organizationId,
      ...(input.destinationOrganizationId
        ? [input.destinationOrganizationId]
        : []),
    ]),
  ].sort();
  const accounts = await tx.contentLearningAccount.findMany({
    where: {
      organizationId: { in: organizationIds },
      brandId: brand.id,
      isDeleted: false,
    },
    select: accountSelect,
    orderBy: { id: 'asc' },
  });
  const brands = input.lockAllSourceBrands
    ? await tx.brand.findMany({
        where: { organizationId: brand.organizationId, isDeleted: false },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    : [{ id: brand.id }];
  if (!brands.some((row) => row.id === brand.id))
    throw new NotFoundException('Brand', brand.id);
  return {
    organizationId: brand.organizationId,
    brandId: brand.id,
    beforeBrand: brand,
    accounts,
    organizationIds,
    brandIds: brands.map((row) => row.id),
  };
}
async function lockBrandAccounts(
  tx: Prisma.TransactionClient,
  scope: BrandLearningScope,
): Promise<void> {
  for (const account of scope.accounts) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "content_learning_accounts" WHERE "id" = ${account.id} AND "organizationId" = ${account.organizationId} AND "brandId" = ${account.brandId} AND "credentialId" = ${account.credentialId} AND "isDeleted" = false FOR UPDATE`,
    );
    if (rows.length !== 1)
      throw new ConflictException(
        'Learning account scope changed during brand mutation.',
      );
  }
}
async function lockBrandSources(
  tx: Prisma.TransactionClient,
  scope: BrandLearningScope,
  input: BrandMutationInput,
): Promise<void> {
  // NO KEY UPDATE still excludes other mutations and FOR SHARE publication capture, but admits
  // the FOR KEY SHARE that every org-scoped insert takes, so a writer already holding a brand
  // key-share lock cannot deadlock against the brand FOR UPDATE below.
  for (const id of scope.organizationIds) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "organizations" WHERE "id" = ${id} AND "isDeleted" = false FOR NO KEY UPDATE`,
    );
    if (rows.length !== 1)
      throw new ConflictException(
        'Organization changed during brand mutation.',
      );
  }
  for (const id of scope.brandIds)
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${id} AND "organizationId" = ${scope.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
  const brand = await tx.brand.findFirst({
    where: {
      id: scope.brandId,
      organizationId: scope.organizationId,
      isDeleted: false,
    },
    select: learningPublicationBrandSelect,
  });
  if (!brand) throw new NotFoundException('Brand', scope.brandId);
  const accounts = await tx.contentLearningAccount.findMany({
    where: {
      organizationId: { in: scope.organizationIds },
      brandId: scope.brandId,
      isDeleted: false,
    },
    select: accountSelect,
    orderBy: { id: 'asc' },
  });
  if (!isDeepStrictEqual(accounts, scope.accounts))
    throw new ConflictException(
      'Learning account discovery changed during brand mutation.',
    );
  if (input.lockAllSourceBrands) {
    const brands = await tx.brand.findMany({
      where: { organizationId: scope.organizationId, isDeleted: false },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (
      !isDeepStrictEqual(
        brands.map((row) => row.id),
        scope.brandIds,
      )
    )
      throw new ConflictException('Brand discovery changed during mutation.');
  }
  scope.beforeBrand = brand;
}
async function takeBrandFence(
  tx: Prisma.TransactionClient,
  input: BrandMutationInput,
  fenceScope: LearningMutationFenceScope | undefined,
): Promise<string | undefined> {
  if (fenceScope === undefined)
    return learningFence(tx, 'exclusive').then(() => undefined);
  const tenantOrganizationId =
    input.organizationId ??
    (isCrossOrgUnsafe() ? undefined : getTenantContext()?.organizationId);
  // tenant-scope-ignore: the pre-fence read only resolves the owning organization for its fence; discovery re-reads under the fence.
  const owner = await tx.brand.findFirst({
    where: {
      id: input.brandId,
      isDeleted: false,
      ...(tenantOrganizationId ? { organizationId: tenantOrganizationId } : {}),
    },
    select: { organizationId: true },
  });
  if (!owner) throw new NotFoundException('Brand', input.brandId);
  await learningMutationFence(tx, owner.organizationId, fenceScope);
  return fenceScope === 'organization' ? owner.organizationId : undefined;
}
/**
 * Relocation and lifecycle callers cross organizations and keep the global
 * fence (no fenceScope). A same-organization patch passes its fence scope.
 */
export async function lockBrandLearningMutation(
  tx: Prisma.TransactionClient,
  input: BrandMutationInput,
  fenceScope?: LearningMutationFenceScope,
): Promise<BrandLearningScope> {
  const fenced = await takeBrandFence(tx, input, fenceScope);
  const scope = await discoverBrandLearningMutation(tx, input);
  // The brand moved organizations between the owner read and the fence.
  if (fenced !== undefined && scope.organizationId !== fenced)
    throw new LearningFenceEscalationError();
  await lockBrandAccounts(tx, scope);
  await lockBrandSources(tx, scope, input);
  return scope;
}
export async function finishBrandLearningMutation(
  tx: Prisma.TransactionClient,
  scope: BrandLearningScope,
  afterBrand: BrandRow,
): Promise<void> {
  const after = {
    id: afterBrand.id,
    organizationId: afterBrand.organizationId,
    isDeleted: afterBrand.isDeleted,
    isActive: afterBrand.isActive,
  };
  if (isDeepStrictEqual(scope.beforeBrand, after)) return;
  await invalidateLearningDependencySource(
    tx,
    'brand',
    scope.brandId,
    scope.organizationId,
  );
  for (const account of scope.accounts) {
    const result = await tx.contentLearningAccount.updateMany({
      where: scopedWhere(account.organizationId, account),
      data: { evidenceRevision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Learning account scope changed during brand invalidation.',
      );
  }
}
export async function patchBrandWithLearning(
  tx: Prisma.TransactionClient,
  input: {
    brandId: string;
    organizationId?: string;
    data: Prisma.BrandUncheckedUpdateInput;
  },
  fenceScope: LearningMutationFenceScope,
): Promise<Prisma.BrandGetPayload<object>> {
  const scope = await lockBrandLearningMutation(
    tx,
    { ...input, lockAllSourceBrands: false },
    fenceScope,
  );
  if (
    input.data.organizationId !== undefined &&
    input.data.organizationId !== scope.organizationId
  )
    throw new BadRequestException(
      'Use authorized brand relocation to change organizations.',
    );
  const brand = await tx.brand.update({
    where: {
      id: scope.brandId,
      organizationId: scope.organizationId,
      isDeleted: false,
    },
    data: input.data,
  });
  await finishBrandLearningMutation(tx, scope, brand);
  return brand;
}

/** `patchBrandWithLearning` in its own transaction, escalating the fence on conflict. */
export function patchBrandWithLearningFenced(
  prisma: Pick<PrismaService, '$transaction'>,
  input: Parameters<typeof patchBrandWithLearning>[1],
): Promise<Prisma.BrandGetPayload<object>> {
  return runFencedLearningMutation(prisma, (tx, fenceScope) =>
    patchBrandWithLearning(tx, input, fenceScope),
  );
}
