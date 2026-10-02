import { isDeepStrictEqual } from 'node:util';
import {
  invalidateLearningDependencySource,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningPublicationCredentialSelect } from '@api/collections/content-learning/services/learning-publication-source.types';
import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { pickCarriedConnectionColumns } from '@api/collections/credentials/utils/credential-persistence.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  getTenantContext,
  isCrossOrgUnsafe,
} from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

type CredentialRow = Prisma.CredentialGetPayload<object>;
type CredentialSnapshot = Prisma.CredentialGetPayload<{
  select: typeof learningPublicationCredentialSelect;
}>;
type AccountRow = Prisma.ContentLearningAccountGetPayload<{
  select: { id: true; organizationId: true; brandId: true; credentialId: true };
}>;
export type CredentialLearningMutationContext = {
  normalizeDocument: (row: unknown) => CredentialDocument;
  normalizeData: (data: unknown) => Record<string, unknown>;
  logger: Pick<LoggerService, 'debug'>;
};
export type CredentialLearningReconcileInput = {
  id: string;
  organizationId: string;
  externalId: string;
  profileUpdate: Record<string, string | null>;
  connectionUpdate: Record<string, unknown>;
};
type CredentialMutationPlan = {
  rows: CredentialRow[];
  scopes: {
    organizationId: string | null;
    brandId: string | null;
    credentialId: string;
  }[];
  accounts: AccountRow[];
  where: Prisma.CredentialWhereInput;
};
const accountSelect = {
  id: true,
  organizationId: true,
  brandId: true,
  credentialId: true,
} as const;

function effectiveBrand(
  data: Prisma.CredentialUncheckedUpdateInput,
  row: CredentialRow,
): string | null {
  if (data.brandId === undefined) return row.brandId;
  if (typeof data.brandId === 'string' || data.brandId === null)
    return data.brandId;
  return data.brandId.set ?? null;
}
async function assertUnboundCredentialHasNoLearning(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  // tenant-scope-ignore: an authorized exact unbound credential ID cannot acquire inferred tenancy from learning attachments.
  const account = await tx.contentLearningAccount.findFirst({
    where: { credentialId: id, isDeleted: false },
    select: { id: true },
  });
  // tenant-scope-ignore: retained invalid/deleted dependency references are anomalies, never authority to select another organization.
  const dependency = await tx.contentLearningDependency.findFirst({
    where: { sourceKind: 'credential', sourceId: id },
    select: { id: true },
  });
  if (account || dependency)
    throw new ConflictException(
      'Unbound credential has retained learning attachments; preserve its original scope for diagnosis.',
    );
}
async function discoverCredentialMutation(
  tx: Prisma.TransactionClient,
  where: Prisma.CredentialWhereInput,
  data: Prisma.CredentialUncheckedUpdateInput,
): Promise<CredentialMutationPlan> {
  const tenant = isCrossOrgUnsafe() ? undefined : getTenantContext();
  const discoveryWhere: Prisma.CredentialWhereInput = tenant
    ? { AND: [where, { organizationId: tenant.organizationId }] }
    : where;
  // tenant-scope-ignore: no-context system callers retain their original bulk filter and null-org behavior; active request tenants are intersected with it.
  const rows = await tx.credential.findMany({
    where: discoveryWhere,
    orderBy: { id: 'asc' },
  });
  const scopes: CredentialMutationPlan['scopes'] = [];
  for (const row of rows) {
    const organizationId =
      data.organizationId !== null && typeof data.organizationId === 'object'
        ? data.organizationId.set
        : data.organizationId;
    if (organizationId !== undefined && organizationId !== row.organizationId)
      throw new BadRequestException(
        'Use authorized brand relocation to change organizations.',
      );
    if (row.organizationId === null)
      await assertUnboundCredentialHasNoLearning(tx, row.id);
    const brandId = effectiveBrand(data, row);
    if (brandId !== row.brandId && brandId) {
      if (row.organizationId === null)
        throw new BadRequestException(
          'A credential brand change requires its original organization.',
        );
      const brand = await tx.brand.findFirst({
        where: {
          id: brandId,
          organizationId: row.organizationId,
          isDeleted: false,
          isActive: true,
        },
        select: { id: true },
      });
      if (!brand)
        throw new BadRequestException(
          'The selected credential brand is unavailable in this organization.',
        );
    }
    for (const target of [row.brandId, brandId])
      scopes.push({
        organizationId: row.organizationId,
        brandId: target,
        credentialId: row.id,
      });
  }
  const accountScopes = scopes.flatMap((scope) =>
    scope.organizationId === null
      ? []
      : [
          {
            organizationId: scope.organizationId,
            credentialId: scope.credentialId,
            ...(scope.brandId === null ? {} : { brandId: scope.brandId }),
          },
        ],
  );
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
  return { rows, scopes, accounts, where };
}
async function lockCredentialAccounts(
  tx: Prisma.TransactionClient,
  plan: CredentialMutationPlan,
): Promise<void> {
  for (const account of plan.accounts) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "content_learning_accounts" WHERE "id" = ${account.id} AND "organizationId" = ${account.organizationId} AND "brandId" = ${account.brandId} AND "credentialId" = ${account.credentialId} AND "isDeleted" = false FOR UPDATE`,
    );
    if (rows.length !== 1)
      throw new ConflictException(
        'Learning account scope changed during credential mutation.',
      );
  }
}
async function lockCredentialSources(
  tx: Prisma.TransactionClient,
  plan: CredentialMutationPlan,
  data: Prisma.CredentialUncheckedUpdateInput,
): Promise<void> {
  for (const id of [
    ...new Set(
      plan.rows.flatMap((row) =>
        row.organizationId === null ? [] : [row.organizationId],
      ),
    ),
  ].sort())
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "organizations" WHERE "id" = ${id} AND "isDeleted" = false FOR UPDATE`,
    );
  for (const brandId of [
    ...new Set(
      plan.scopes.flatMap((scope) =>
        scope.organizationId !== null && scope.brandId ? [scope.brandId] : [],
      ),
    ),
  ].sort()) {
    const scope = plan.scopes.find(
      (row) => row.brandId === brandId && row.organizationId !== null,
    );
    if (!scope || scope.organizationId === null)
      throw new ConflictException(
        'Credential brand scope changed during mutation.',
      );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${brandId} AND "organizationId" = ${scope.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
  }
  for (const row of plan.rows) {
    // tenant-scope-ignore: exact selected tombstone state preserves the original explicit bulk filter semantics.
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "credentials" WHERE "id" = ${row.id} AND "organizationId" IS NOT DISTINCT FROM ${row.organizationId} AND "isDeleted" = ${row.isDeleted} FOR UPDATE`,
    );
    if (rows.length !== 1)
      throw new ConflictException('Credential source changed during mutation.');
  }
  const current = await discoverCredentialMutation(tx, plan.where, data);
  const identities = (rows: CredentialRow[]) =>
    rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      brandId: row.brandId,
      platform: row.platform,
      externalId: row.externalId,
      isDeleted: row.isDeleted,
    }));
  if (
    !isDeepStrictEqual(identities(current.rows), identities(plan.rows)) ||
    !isDeepStrictEqual(current.accounts, plan.accounts)
  )
    throw new ConflictException(
      'Credential discovery changed during mutation.',
    );
  plan.rows = current.rows;
}
async function credentialSnapshots(
  tx: Prisma.TransactionClient,
  plan: CredentialMutationPlan,
): Promise<CredentialSnapshot[]> {
  const rows: CredentialSnapshot[] = [];
  for (const row of plan.rows) {
    // tenant-scope-ignore: exact original-org tombstone read compares the persisted result of an owned mutation.
    const current = await tx.credential.findFirst({
      where: { id: row.id, organizationId: row.organizationId },
      select: learningPublicationCredentialSelect,
    });
    if (!current)
      throw new ConflictException('Credential vanished during mutation.');
    rows.push(current);
  }
  return rows;
}
async function finishCredentialMutation(
  tx: Prisma.TransactionClient,
  plan: CredentialMutationPlan,
  before: CredentialSnapshot[],
): Promise<void> {
  const after = await credentialSnapshots(tx, plan),
    changed = new Set<string>();
  for (let index = 0; index < before.length; index++) {
    const original = before[index];
    if (
      original.organizationId !== null &&
      !isDeepStrictEqual(original, after[index])
    ) {
      await invalidateLearningDependencySource(
        tx,
        'credential',
        original.id,
        original.organizationId,
      );
      changed.add(original.id);
    }
  }
  for (const account of plan.accounts.filter((row) =>
    changed.has(row.credentialId),
  )) {
    const result = await tx.contentLearningAccount.updateMany({
      where: scopedWhere(account.organizationId, account),
      data: { evidenceRevision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Learning account changed during credential invalidation.',
      );
  }
}
async function prepareCredentialMutation(
  tx: Prisma.TransactionClient,
  where: Prisma.CredentialWhereInput,
  data: Prisma.CredentialUncheckedUpdateInput,
): Promise<CredentialMutationPlan> {
  await learningFence(tx, 'exclusive');
  const plan = await discoverCredentialMutation(tx, where, data);
  await lockCredentialAccounts(tx, plan);
  await lockCredentialSources(tx, plan, data);
  return plan;
}
export async function patchCredentialsWithLearning(
  tx: Prisma.TransactionClient,
  _context: CredentialLearningMutationContext,
  where: Prisma.CredentialWhereInput,
  data: Prisma.CredentialUncheckedUpdateInput,
): Promise<{ modifiedCount: number; affectedOrganizationIds: string[] }> {
  const plan = await prepareCredentialMutation(tx, where, data),
    before = await credentialSnapshots(tx, plan);
  let modifiedCount = 0;
  for (const row of plan.rows) {
    // tenant-scope-ignore: explicit tombstone bulk selectors retain their exact original-org selected state.
    const result = await tx.credential.updateMany({
      where: {
        AND: [
          where,
          {
            id: row.id,
            organizationId: row.organizationId,
            isDeleted: row.isDeleted,
          },
        ],
      },
      data,
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Credential bulk selection changed before mutation.',
      );
    modifiedCount += result.count;
  }
  await finishCredentialMutation(tx, plan, before);
  return {
    modifiedCount,
    affectedOrganizationIds: [
      ...new Set(
        plan.rows.flatMap((row) =>
          row.organizationId === null ? [] : [row.organizationId],
        ),
      ),
    ],
  };
}
export async function patchCredentialWithLearning(
  tx: Prisma.TransactionClient,
  context: CredentialLearningMutationContext,
  id: string,
  data: Prisma.CredentialUncheckedUpdateInput,
  populate?: Prisma.CredentialInclude,
): Promise<CredentialDocument> {
  const plan = await prepareCredentialMutation(
    tx,
    { id, isDeleted: false },
    data,
  );
  if (plan.rows.length !== 1) throw new NotFoundException('Credential', id);
  const before = await credentialSnapshots(tx, plan),
    row = plan.rows[0];
  const updated = await tx.credential.update({
    ...(populate ? { include: populate } : {}),
    where: { id, organizationId: row.organizationId, isDeleted: false },
    data,
  });
  await finishCredentialMutation(tx, plan, before);
  return context.normalizeDocument(updated);
}
export async function removeCredentialWithLearning(
  tx: Prisma.TransactionClient,
  context: CredentialLearningMutationContext,
  id: string,
): Promise<CredentialDocument | null> {
  const data = { isDeleted: true };
  const plan = await prepareCredentialMutation(
    tx,
    { id, isDeleted: false },
    data,
  );
  if (!plan.rows.length) return null;
  const before = await credentialSnapshots(tx, plan),
    row = plan.rows[0];
  const deleted = await tx.credential.update({
    where: { id, organizationId: row.organizationId, isDeleted: false },
    data,
  });
  await finishCredentialMutation(tx, plan, before);
  return context.normalizeDocument(deleted);
}
async function discoverReconcileWhere(
  tx: Prisma.TransactionClient,
  input: CredentialLearningReconcileInput,
): Promise<Prisma.CredentialWhereInput> {
  const source = await tx.credential.findFirst({
    where: {
      id: input.id,
      organizationId: input.organizationId,
      isDeleted: false,
    },
  });
  if (!source) throw new NotFoundException('Credential', input.id);
  return {
    organizationId: input.organizationId,
    isDeleted: false,
    OR: [
      { id: input.id },
      ...(source.brandId && source.platform
        ? [
            {
              brandId: source.brandId,
              platform: source.platform,
              externalId: input.externalId,
            },
          ]
        : []),
    ],
  };
}
async function settleCredentialReconciliation(
  tx: Prisma.TransactionClient,
  context: CredentialLearningMutationContext,
  input: CredentialLearningReconcileInput,
  plan: CredentialMutationPlan,
): Promise<CredentialDocument> {
  const source = plan.rows.find((row) => row.id === input.id);
  if (!source) throw new NotFoundException('Credential', input.id);
  const { count } = await tx.credential.updateMany({
    data: { oauthState: null },
    where: {
      id: source.id,
      organizationId: input.organizationId,
      isDeleted: false,
      OR: [{ externalId: null }, { externalId: input.externalId }],
    },
  });
  if (!count)
    throw new HttpException(
      {
        detail:
          'This credential is already connected to an account. Disconnect and reconnect to choose a different one.',
        title: 'Already Connected',
      },
      HttpStatus.BAD_REQUEST,
    );
  const clearedOAuth = {
    oauthState: null,
    oauthToken: null,
    oauthTokenHash: null,
    oauthTokenSecret: null,
  };
  const incumbent = plan.rows.find((row) => row.id !== source.id);
  const data = {
    ...pickCarriedConnectionColumns(context.normalizeDocument(source)),
    ...input.connectionUpdate,
    ...input.profileUpdate,
    ...clearedOAuth,
    externalId: input.externalId,
    isConnected: true,
    ...(typeof source.isHistoryImportRequested === 'boolean'
      ? { isHistoryImportRequested: source.isHistoryImportRequested }
      : {}),
  };
  const survivor = await tx.credential.update({
    where: {
      id: incumbent?.id ?? source.id,
      organizationId: input.organizationId,
      isDeleted: false,
    },
    data,
  });
  if (incumbent)
    await tx.credential.update({
      where: {
        id: source.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: {
        ...clearedOAuth,
        accessToken: null,
        accessTokenSecret: null,
        accessTokenExpiry: null,
        refreshToken: null,
        refreshTokenExpiry: null,
        grantedScopes: [],
        grantedScopesCapturedAt: null,
        isConnected: false,
        isDeleted: true,
      },
    });
  return context.normalizeDocument(survivor);
}
export async function reconcileCredentialWithLearning(
  tx: Prisma.TransactionClient,
  context: CredentialLearningMutationContext,
  input: CredentialLearningReconcileInput,
): Promise<CredentialDocument> {
  await learningFence(tx, 'exclusive');
  const where = await discoverReconcileWhere(tx, input);
  const plan = await discoverCredentialMutation(tx, where, {});
  await lockCredentialAccounts(tx, plan);
  await lockCredentialSources(tx, plan, {});
  const currentWhere = await discoverReconcileWhere(tx, input);
  if (!isDeepStrictEqual(where, currentWhere))
    throw new ConflictException(
      'Credential connection selection changed during mutation.',
    );
  const before = await credentialSnapshots(tx, plan);
  const survivor = await settleCredentialReconciliation(
    tx,
    context,
    input,
    plan,
  );
  await finishCredentialMutation(tx, plan, before);
  return survivor;
}
