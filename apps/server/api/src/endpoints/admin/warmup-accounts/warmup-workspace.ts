import type {
  IWarmupAccountDiagnostics,
  IWarmupReadiness,
} from '@genfeedai/contracts/interfaces';
import {
  type Brand,
  type CreditBalance,
  type Organization,
  Prisma,
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
  await tx.organizationSetting.update({
    where: { organizationId, isDeleted: false },
    data: { hasEverHadCredits: true },
  });
  return transaction;
}

export async function warmupReadiness(
  tx: Prisma.TransactionClient,
  account: WarmupAccount,
): Promise<IWarmupReadiness> {
  const blockers: string[] = [];
  const { organizationId, brandId, customerUserId } = account;
  const preparation = warmupDiagnostics(account).preparation;
  if (!organizationId || !brandId || !customerUserId)
    return {
      ready: false,
      blockers: ['Repair workspace resources'],
      availableCredits: 0,
    };
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
  if (!organization || !brand || !settings || !userSettings)
    blockers.push('Repair workspace and user settings');
  if (
    !organization?.billingAccountId ||
    balance?.billingAccountId !== organization.billingAccountId
  )
    blockers.push('Repair dedicated billing and wallet');
  if (organization?.billingAccountId) {
    const billingAccountId = organization.billingAccountId;
    const [billing, owner, link] = await Promise.all([
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
    if (!billing || !owner || !link)
      blockers.push('Repair billing ownership and organization link');
  }
  const grant = preparation?.grant;
  const availableCredits = (balance?.balance ?? 0) - (balance?.heldAmount ?? 0);
  if (!grant) blockers.push('Configure the promotional handoff grant');
  else {
    const entry = await tx.creditTransaction.findFirst({
      where: {
        id: grant.transactionId,
        organizationId,
        billingAccountId: organization?.billingAccountId,
        isDeleted: false,
        idempotencyKey: `warmup:${account.id}:grant`,
        amount: grant.amount,
      },
    });
    if (!entry) blockers.push('Repair the promotional grant ledger entry');
  }
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
      lastUsedBrandId: brandId,
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
      diagnostics: {
        ...(account.diagnostics as Prisma.JsonObject),
        preparation: { ...preparation, claimedAt: event.timestamp },
      } as unknown as Prisma.InputJsonValue,
      auditEvents: [
        ...(Array.isArray(account.auditEvents) ? account.auditEvents : []),
        event,
      ],
    },
  });
  return `/${workspace.organization.slug}/${workspace.brand.slug}`;
}
