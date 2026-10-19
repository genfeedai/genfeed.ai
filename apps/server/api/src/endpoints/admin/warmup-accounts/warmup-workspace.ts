import { recordCreditTransactionActivity } from '@api/collections/credits/services/credit-activity.util';
import type {
  IWarmupAccountDiagnostics,
  IWarmupReadiness,
} from '@genfeedai/contracts/interfaces';
import {
  type Article,
  type Asset,
  type BillingAccount,
  type BillingAccountMember,
  type BillingAccountOrganization,
  type Brand,
  type CreditBalance,
  type CreditTransaction,
  type Organization,
  type OrganizationSetting,
  Prisma,
  type Setting,
  toPrismaJson,
  type WarmupAccount,
} from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

export function warmupDiagnostics(
  account: Pick<WarmupAccount, 'diagnostics'>,
): IWarmupAccountDiagnostics {
  return account.diagnostics as unknown as IWarmupAccountDiagnostics;
}

export async function lockWarmup(
  tx: Prisma.TransactionClient,
  identity: string,
): Promise<void> {
  const key = `warmup:${identity}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}

export function warmupScope(account: WarmupAccount) {
  if (!account.organizationId || !account.brandId || !account.customerUserId) {
    throw new BadRequestException(
      'Repair the missing warm-up workspace before continuing',
    );
  }
  return {
    organizationId: account.organizationId,
    brandId: account.brandId,
    customerUserId: account.customerUserId,
  };
}

export function assertWarmupMutable(account: WarmupAccount): void {
  if (account.status === 'CLAIMED' || account.status === 'ARCHIVED') {
    throw new BadRequestException(
      'This warm-up account is no longer in preparation',
    );
  }
}

export async function reconcileWarmupWorkspace(
  tx: Prisma.TransactionClient,
  account: WarmupAccount,
): Promise<{
  organization: Organization;
  brand: Brand;
  balance: CreditBalance;
  billingAccountId: string;
}> {
  const { organizationId, brandId, customerUserId } = warmupScope(account);
  const organization = await tx.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
  });
  const brand = await tx.brand.findFirst({
    where: { id: brandId, organizationId, isDeleted: false },
  });
  const customer = await tx.user.findFirst({
    where: { id: customerUserId, isDeleted: false },
  });
  if (!organization || !brand || !customer)
    throw new BadRequestException(
      'Warm-up workspace resources are missing or archived',
    );
  if (account.status !== 'CLAIMED') {
    await tx.member.updateMany({
      where: { organizationId, userId: customerUserId, isDeleted: false },
      data: { isActive: false },
    });
  }
  await tx.organizationSetting.upsert({
    where: { organizationId },
    create: { organizationId },
    update: { isDeleted: false },
  });
  await tx.setting.upsert({
    where: { userId: customerUserId },
    create: { userId: customerUserId },
    update: { isDeleted: false },
  });
  let billingAccountId = organization.billingAccountId;
  if (billingAccountId) {
    const billing = await tx.billingAccount.findFirst({
      where: { id: billingAccountId, isDeleted: false },
    });
    const otherLink = await tx.billingAccountOrganization.findFirst({
      where: {
        billingAccountId,
        organizationId: { not: organizationId },
        isDeleted: false,
        status: 'LINKED',
      },
    });
    const otherOrg = await tx.organization.findFirst({
      where: {
        billingAccountId,
        id: { not: organizationId },
        isDeleted: false,
      },
    });
    if (!billing || otherLink || otherOrg)
      throw new BadRequestException(
        'Warm-up billing must be dedicated; repair the conflicting billing link before continuing',
      );
  } else {
    const existingLink = await tx.billingAccountOrganization.findFirst({
      where: { organizationId, isDeleted: false, status: 'LINKED' },
    });
    if (existingLink) {
      billingAccountId = existingLink.billingAccountId;
      await tx.organization.update({
        where: { id: organizationId, isDeleted: false },
        data: { billingAccountId },
      });
      return reconcileWarmupWorkspace(tx, { ...account });
    }
    const billing = await tx.billingAccount.create({
      data: { label: organization.label },
    });
    billingAccountId = billing.id;
    await tx.organization.update({
      where: { id: organizationId, isDeleted: false },
      data: { billingAccountId },
    });
  }
  const foreignWallet = await tx.creditBalance.findFirst({
    where: {
      billingAccountId,
      isDeleted: false,
      OR: [
        { organizationId: { not: organizationId } },
        { organizationId: null },
      ],
    },
  });
  if (foreignWallet)
    throw new BadRequestException(
      'Warm-up billing has an unrelated or shared wallet',
    );
  await tx.billingAccountMember.upsert({
    where: {
      billingAccountId_userId: { billingAccountId, userId: customerUserId },
    },
    create: { billingAccountId, userId: customerUserId, role: 'OWNER' },
    update: { isDeleted: false, role: 'OWNER' },
  });
  const link = await tx.billingAccountOrganization.findFirst({
    where: {
      billingAccountId,
      organizationId,
      isDeleted: false,
      status: 'LINKED',
    },
  });
  if (!link)
    await tx.billingAccountOrganization.create({
      data: { billingAccountId, organizationId },
    });
  let balance = await tx.creditBalance.findFirst({
    where: { organizationId, isDeleted: false },
  });
  if (
    balance?.billingAccountId &&
    balance.billingAccountId !== billingAccountId
  )
    throw new BadRequestException(
      'Warm-up wallet belongs to a different billing account',
    );
  if (!balance)
    balance = await tx.creditBalance.create({
      data: { billingAccountId, organizationId },
    });
  else if (!balance.billingAccountId)
    balance = await tx.creditBalance.update({
      where: { id: balance.id, organizationId, isDeleted: false },
      data: { billingAccountId },
    });
  return { organization, brand, balance, billingAccountId };
}

export async function creditWarmupWallet(
  tx: Prisma.TransactionClient,
  account: WarmupAccount,
  actorUserId: string,
  amount: number,
  key: string,
  reason: string,
) {
  const { organizationId } = warmupScope(account);
  const { billingAccountId, balance } = await reconcileWarmupWorkspace(
    tx,
    account,
  );
  const replay = await tx.creditTransaction.findFirst({
    where: { organizationId, isDeleted: false, idempotencyKey: key },
  });
  if (replay) return replay;
  if (!Number.isFinite(amount) || amount <= 0)
    throw new BadRequestException('Credit grant must be positive');
  const updated = await tx.creditBalance.update({
    where: {
      id: balance.id,
      organizationId,
      billingAccountId,
      isDeleted: false,
    },
    data: { balance: { increment: amount }, version: { increment: 1 } },
  });
  const transaction = await tx.creditTransaction.create({
    data: {
      organizationId,
      billingAccountId,
      actorUserId,
      idempotencyKey: key,
      amount,
      balanceAfter: updated.balance,
      category: 'add',
      source: key.endsWith(':grant') ? 'warmup-handoff' : 'warmup-preparation',
      description: reason,
      referenceId: account.id,
      referenceType: 'warmup-account',
      metadata: {
        balanceBefore: updated.balance - amount,
        category: 'add',
      },
    },
  });
  await recordCreditTransactionActivity(tx, transaction);
  await tx.organizationSetting.update({
    where: { organizationId, isDeleted: false },
    data: { hasEverHadCredits: true },
  });
  return transaction;
}

interface WarmupReadinessFacts {
  article: Article | null;
  asset: Asset | null;
  balance: CreditBalance | null;
  billing: BillingAccount | null;
  brand: Brand | null;
  grantEntry: CreditTransaction | null;
  link: BillingAccountOrganization | null;
  organization: Organization | null;
  owner: BillingAccountMember | null;
  settings: OrganizationSetting | null;
  userSettings: Setting | null;
}

const NOT_READY_WITHOUT_WORKSPACE: IWarmupReadiness = {
  availableCredits: 0,
  blockers: ['Repair workspace resources'],
  ready: false,
};

function hasWorkspaceScope(account: WarmupAccount): account is WarmupAccount & {
  brandId: string;
  customerUserId: string;
  organizationId: string;
} {
  return Boolean(
    account.organizationId && account.brandId && account.customerUserId,
  );
}

/** Pure blocker computation over already-loaded rows (no database access). */
function evaluateWarmupReadiness(
  account: WarmupAccount,
  facts: WarmupReadinessFacts,
): IWarmupReadiness {
  const blockers: string[] = [];
  const preparation = warmupDiagnostics(account).preparation;
  const {
    article,
    asset,
    balance,
    billing,
    brand,
    grantEntry,
    link,
    organization,
    owner,
    settings,
    userSettings,
  } = facts;
  if (!organization || !brand || !settings || !userSettings)
    blockers.push('Repair workspace and user settings');
  if (
    !organization?.billingAccountId ||
    balance?.billingAccountId !== organization.billingAccountId
  )
    blockers.push('Repair dedicated billing and wallet');
  if (organization?.billingAccountId && (!billing || !owner || !link))
    blockers.push('Repair billing ownership and organization link');
  const grant = preparation?.grant;
  const availableCredits = (balance?.balance ?? 0) - (balance?.heldAmount ?? 0);
  if (!grant) blockers.push('Configure the promotional handoff grant');
  else if (!grantEntry)
    blockers.push('Repair the promotional grant ledger entry');
  if (grant && availableCredits < grant.amount)
    blockers.push('Reconcile preparation costs to restore handoff credits');
  if ((balance?.heldAmount ?? 0) > 0)
    blockers.push('Wait for outstanding generation reservations');
  if (!preparation?.contextReviewedAt)
    blockers.push('Review and apply brand context');
  if (!asset) blockers.push('Prepare one completed private starter asset');
  if (!article) blockers.push('Prepare one private LinkedIn article draft');
  if (preparation?.generation && preparation.generation.status !== 'completed')
    blockers.push('Complete or repair starter generation');
  if (account.status === 'ARCHIVED') blockers.push('Account is archived');
  return {
    ready: blockers.length === 0,
    blockers,
    availableCredits,
    workspacePath:
      organization && brand ? `/${organization.slug}/${brand.slug}` : undefined,
  };
}

export async function warmupReadiness(
  tx: Prisma.TransactionClient,
  account: WarmupAccount,
): Promise<IWarmupReadiness> {
  if (!hasWorkspaceScope(account)) return NOT_READY_WITHOUT_WORKSPACE;
  const { organizationId, brandId, customerUserId } = account;
  const preparation = warmupDiagnostics(account).preparation;
  const [organization, brand, settings, userSettings, balance, asset, article] =
    await Promise.all([
      tx.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
      }),
      tx.brand.findFirst({
        where: { id: brandId, organizationId, isDeleted: false },
      }),
      tx.organizationSetting.findFirst({
        where: { organizationId, isDeleted: false },
      }),
      tx.setting.findFirst({
        where: { userId: customerUserId, isDeleted: false },
      }),
      tx.creditBalance.findFirst({
        where: { organizationId, isDeleted: false },
      }),
      preparation?.assetId
        ? tx.asset.findFirst({
            where: {
              id: preparation.assetId,
              parentOrgId: organizationId,
              parentBrandId: brandId,
              parentType: 'BRAND',
              isDeleted: false,
              userId: account.operatorUserId,
              cloudObjectKey: { not: null },
            },
          })
        : null,
      preparation?.articleId
        ? tx.article.findFirst({
            where: {
              id: preparation.articleId,
              organizationId,
              brandId,
              isDeleted: false,
              status: 'DRAFT',
              userId: account.operatorUserId,
              scope: 'ORGANIZATION',
              category: 'linkedin-article',
              publishedAt: null,
            },
          })
        : null,
    ]);
  let billing: BillingAccount | null = null;
  let owner: BillingAccountMember | null = null;
  let link: BillingAccountOrganization | null = null;
  if (organization?.billingAccountId) {
    const billingAccountId = organization.billingAccountId;
    [billing, owner, link] = await Promise.all([
      tx.billingAccount.findFirst({
        where: { id: billingAccountId, isDeleted: false },
      }),
      tx.billingAccountMember.findFirst({
        where: {
          billingAccountId,
          userId: customerUserId,
          role: 'OWNER',
          isDeleted: false,
        },
      }),
      tx.billingAccountOrganization.findFirst({
        where: {
          billingAccountId,
          organizationId,
          status: 'LINKED',
          isDeleted: false,
        },
      }),
    ]);
  }
  const grant = preparation?.grant;
  const grantEntry = grant
    ? await tx.creditTransaction.findFirst({
        where: {
          id: grant.transactionId,
          organizationId,
          billingAccountId: organization?.billingAccountId,
          isDeleted: false,
          idempotencyKey: `warmup:${account.id}:grant`,
          amount: grant.amount,
        },
      })
    : null;
  return evaluateWarmupReadiness(account, {
    article,
    asset,
    balance,
    billing,
    brand,
    grantEntry,
    link,
    organization,
    owner,
    settings,
    userSettings,
  });
}

function firstBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const rowKey = key(row);
    if (!byKey.has(rowKey)) byKey.set(rowKey, row);
  }
  return byKey;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

/**
 * Readiness for a page of accounts in a fixed number of queries.
 *
 * Every lookup `warmupReadiness` makes per account becomes one `findMany ...
 * in [...]` over the page's accounts, then each account is matched back to
 * its own rows with the same tenant/ownership predicates, so the verdict is
 * identical to calling `warmupReadiness` one account at a time.
 */
export async function warmupReadinessBatch(
  tx: Prisma.TransactionClient,
  accounts: WarmupAccount[],
): Promise<IWarmupReadiness[]> {
  const scoped = accounts.filter(hasWorkspaceScope);
  if (scoped.length === 0)
    return accounts.map(() => NOT_READY_WITHOUT_WORKSPACE);

  const organizationIds = uniqueStrings(scoped.map((a) => a.organizationId));
  const brandIds = uniqueStrings(scoped.map((a) => a.brandId));
  const customerIds = uniqueStrings(scoped.map((a) => a.customerUserId));
  const operatorIds = uniqueStrings(scoped.map((a) => a.operatorUserId));
  const preparations = scoped.map((a) => warmupDiagnostics(a).preparation);
  const assetIds = uniqueStrings(preparations.map((p) => p?.assetId));
  const articleIds = uniqueStrings(preparations.map((p) => p?.articleId));
  const grantIds = uniqueStrings(
    preparations.map((p) => p?.grant?.transactionId),
  );

  const [
    organizations,
    brands,
    orgSettings,
    userSettings,
    balances,
    assets,
    articles,
  ] = await Promise.all([
    tx.organization.findMany({
      where: { id: { in: organizationIds }, isDeleted: false },
    }),
    tx.brand.findMany({
      where: {
        id: { in: brandIds },
        organizationId: { in: organizationIds },
        isDeleted: false,
      },
    }),
    tx.organizationSetting.findMany({
      where: { organizationId: { in: organizationIds }, isDeleted: false },
    }),
    tx.setting.findMany({
      where: { userId: { in: customerIds }, isDeleted: false },
    }),
    tx.creditBalance.findMany({
      where: { organizationId: { in: organizationIds }, isDeleted: false },
    }),
    assetIds.length
      ? tx.asset.findMany({
          where: {
            id: { in: assetIds },
            parentOrgId: { in: organizationIds },
            parentBrandId: { in: brandIds },
            parentType: 'BRAND',
            isDeleted: false,
            userId: { in: operatorIds },
            cloudObjectKey: { not: null },
          },
        })
      : [],
    articleIds.length
      ? tx.article.findMany({
          where: {
            id: { in: articleIds },
            organizationId: { in: organizationIds },
            brandId: { in: brandIds },
            isDeleted: false,
            status: 'DRAFT',
            userId: { in: operatorIds },
            scope: 'ORGANIZATION',
            category: 'linkedin-article',
            publishedAt: null,
          },
        })
      : [],
  ]);

  const organizationById = firstBy(organizations, (row) => row.id);
  const billingAccountIds = uniqueStrings(
    organizations.map((row) => row.billingAccountId),
  );
  const [billings, owners, links, grantEntries] = await Promise.all([
    billingAccountIds.length
      ? tx.billingAccount.findMany({
          where: { id: { in: billingAccountIds }, isDeleted: false },
        })
      : [],
    billingAccountIds.length
      ? tx.billingAccountMember.findMany({
          where: {
            billingAccountId: { in: billingAccountIds },
            userId: { in: customerIds },
            role: 'OWNER',
            isDeleted: false,
          },
        })
      : [],
    billingAccountIds.length
      ? tx.billingAccountOrganization.findMany({
          where: {
            billingAccountId: { in: billingAccountIds },
            organizationId: { in: organizationIds },
            status: 'LINKED',
            isDeleted: false,
          },
        })
      : [],
    grantIds.length
      ? tx.creditTransaction.findMany({
          where: {
            id: { in: grantIds },
            organizationId: { in: organizationIds },
            isDeleted: false,
          },
        })
      : [],
  ]);

  const brandById = firstBy(brands, (row) => row.id);
  const settingsByOrg = firstBy(orgSettings, (row) => row.organizationId);
  const userSettingsByUser = firstBy(userSettings, (row) => row.userId);
  const balanceByOrg = firstBy(balances, (row) => row.organizationId ?? '');
  const assetById = firstBy(assets, (row) => row.id);
  const articleById = firstBy(articles, (row) => row.id);
  const billingById = firstBy(billings, (row) => row.id);
  const ownerByBillingUser = firstBy(
    owners,
    (row) => `${row.billingAccountId}:${row.userId}`,
  );
  const linkByBillingOrg = firstBy(
    links,
    (row) => `${row.billingAccountId}:${row.organizationId}`,
  );
  const grantEntryById = firstBy(grantEntries, (row) => row.id);

  return accounts.map((account) => {
    if (!hasWorkspaceScope(account)) return NOT_READY_WITHOUT_WORKSPACE;
    const { organizationId, brandId, customerUserId } = account;
    const preparation = warmupDiagnostics(account).preparation;
    const organization = organizationById.get(organizationId) ?? null;
    const billingAccountId = organization?.billingAccountId;

    const brandRow = brandById.get(brandId);
    const brand = brandRow?.organizationId === organizationId ? brandRow : null;

    const assetRow = preparation?.assetId
      ? assetById.get(preparation.assetId)
      : undefined;
    const asset =
      assetRow &&
      assetRow.parentOrgId === organizationId &&
      assetRow.parentBrandId === brandId &&
      assetRow.userId === account.operatorUserId
        ? assetRow
        : null;

    const articleRow = preparation?.articleId
      ? articleById.get(preparation.articleId)
      : undefined;
    const article =
      articleRow &&
      articleRow.organizationId === organizationId &&
      articleRow.brandId === brandId &&
      articleRow.userId === account.operatorUserId
        ? articleRow
        : null;

    const grant = preparation?.grant;
    const grantRow = grant
      ? grantEntryById.get(grant.transactionId)
      : undefined;
    const grantEntry =
      grant &&
      grantRow &&
      grantRow.organizationId === organizationId &&
      (organization === null ||
        grantRow.billingAccountId === billingAccountId) &&
      grantRow.idempotencyKey === `warmup:${account.id}:grant` &&
      grantRow.amount === grant.amount
        ? grantRow
        : null;

    return evaluateWarmupReadiness(account, {
      article,
      asset,
      balance: balanceByOrg.get(organizationId) ?? null,
      billing: billingAccountId
        ? (billingById.get(billingAccountId) ?? null)
        : null,
      brand,
      grantEntry,
      link: billingAccountId
        ? (linkByBillingOrg.get(`${billingAccountId}:${organizationId}`) ??
          null)
        : null,
      organization,
      owner: billingAccountId
        ? (ownerByBillingUser.get(`${billingAccountId}:${customerUserId}`) ??
          null)
        : null,
      settings: settingsByOrg.get(organizationId) ?? null,
      userSettings: userSettingsByUser.get(customerUserId) ?? null,
    });
  });
}

export async function claimWarmupWorkspace(
  tx: Prisma.TransactionClient,
  invitationId: string,
  organizationId: string,
  userId: string,
): Promise<string | undefined> {
  const existing = await tx.warmupAccount.findFirst({
    where: { invitationId, organizationId, isDeleted: false },
  });
  if (!existing) return undefined;
  await lockWarmup(tx, existing.id);
  const account = await tx.warmupAccount.findFirstOrThrow({
    where: { id: existing.id, organizationId, isDeleted: false },
  });
  if (account.customerUserId !== userId || account.status === 'ARCHIVED')
    throw new BadRequestException(
      'Warm-up invitation does not match this customer',
    );
  const { brandId } = warmupScope(account);
  const workspace = await reconcileWarmupWorkspace(tx, account);
  const preparation = warmupDiagnostics(account).preparation;
  if (preparation?.grant && workspace.balance.heldAmount === 0) {
    const amount = Math.max(
      0,
      preparation.grant.amount - workspace.balance.balance,
    );
    if (amount > 0)
      await creditWarmupWallet(
        tx,
        account,
        account.operatorUserId,
        amount,
        `warmup:${account.id}:claim-reconciliation`,
        'Restore promised customer balance after operator preparation',
      );
  }
  const readiness = await warmupReadiness(tx, account);
  if (!readiness.ready)
    throw new BadRequestException({
      message:
        'This prepared workspace needs operator repair before acceptance',
      blockers: readiness.blockers,
    });
  const role = await tx.role.findFirst({
    where: { key: 'admin', isDeleted: false },
  });
  if (!role) throw new BadRequestException('Admin role is unavailable');
  await tx.member.updateMany({
    where: { organizationId, userId, isDeleted: false },
    data: {
      roleId: role.id,
      roleKey: role.key,
      isActive: true,
      currentBrandId: brandId,
    },
  });
  if (account.operatorUserId !== userId)
    await tx.member.updateMany({
      where: {
        organizationId,
        userId: account.operatorUserId,
        isDeleted: false,
      },
      data: { isActive: false },
    });
  await tx.organization.update({
    where: { id: organizationId, isDeleted: false },
    data: { onboardingCompleted: true },
  });
  await tx.organizationSetting.update({
    where: { organizationId, isDeleted: false },
    data: { isFirstLogin: false },
  });
  await tx.setting.update({
    where: { userId, isDeleted: false },
    data: { isFirstLogin: false },
  });
  await tx.user.update({
    where: { id: userId, isDeleted: false },
    data: {
      lastUsedOrganizationId: organizationId,
      onboardingCompletedAt: new Date(),
    },
  });
  const event = {
    actorUserId: userId,
    message: `Customer claimed workspace; operator ${account.operatorUserId} preparation access removed.`,
    timestamp: new Date().toISOString(),
  };
  await tx.warmupAccount.update({
    where: { id: account.id, organizationId, isDeleted: false },
    data: {
      status: 'CLAIMED',
      diagnostics: toPrismaJson({
        ...(account.diagnostics as Prisma.JsonObject),
        preparation: { ...preparation, claimedAt: event.timestamp },
      }),
      auditEvents: [
        ...(Array.isArray(account.auditEvents) ? account.auditEvents : []),
        event,
      ],
    },
  });
  return `/${workspace.organization.slug}/${workspace.brand.slug}`;
}
