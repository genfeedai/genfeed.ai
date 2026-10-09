import { readArtifactRecord } from '@api/agent-artifacts/agent-artifact-material.util';
import {
  cadencePublicationDate,
  getCadenceWeek,
  resolveCadencePolicy,
} from '@api/collections/agent-strategies/services/agent-strategy-cadence.util';
import { readBreakoutMonthlyUsage } from '@api/collections/outliers/services/breakout-monthly-usage.util';
import { resolveBillingAccountAccess } from '@api/tenancy/billing-account-scope';
import { billingAccountScopedWhere } from '@api/tenancy/scoped-where';
import {
  Platform,
  TargetExecutionState,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  BreakoutLiveCapacityInput,
  BreakoutLiveCapacitySnapshot,
  LearningFormat,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { z } from 'zod';

const credits = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const capList = z
  .array(z.object({ key: z.string().min(1), creditBudget: credits }))
  .max(200)
  .refine((rows) => new Set(rows.map((row) => row.key)).size === rows.length);
const policySchema = z.object({
  dailyCreditBudget: credits.default(0),
  dailyCreditsUsed: credits.default(0),
  weeklyCreditBudget: credits.default(0),
  creditsUsedThisWeek: credits.default(0),
  monthToDateCreditsUsed: credits.default(0),
  postsPerWeek: z.number().int().optional(),
  publishingCeilingPerWeek: z.number().int().optional(),
  readyDraftReserve: z.number().int().optional(),
  timezone: z.string().default('UTC'),
});
const budgetSchema = z.object({
  monthlyCreditBudget: credits.default(500),
  perPlatformCaps: capList.default([]),
  perFormatCaps: capList.default([]),
});
const formats: LearningFormat[] = [
  'text',
  'image',
  'carousel',
  'video',
  'short',
  'thread',
];

/** Read-only advisory capacity; billing scope is resolved by the existing account authority. */
export async function readBreakoutLiveCapacity(
  tx: Prisma.TransactionClient,
  input: Readonly<BreakoutLiveCapacityInput>,
): Promise<BreakoutLiveCapacitySnapshot> {
  if (
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isFinite(new Date(input.nowMs).getTime())
  )
    throw new RangeError('A valid capacity snapshot time is required');
  const { organizationId, brandId, credentialId, platform, strategyId } = input;
  const strategy = await tx.agentStrategy.findFirst({
    where: {
      id: strategyId,
      organizationId,
      brandId,
      isDeleted: false,
      isActive: true,
    },
    select: { config: true, policies: true, platforms: true },
  });
  if (!strategy) return { status: 'held', reason: 'missing_strategy' };
  const prismaPlatform = toPrismaCredentialPlatform(platform);
  if (!prismaPlatform) return { status: 'held', reason: 'account_unavailable' };
  const credential = await tx.credential.findFirst({
    where: {
      id: credentialId,
      organizationId,
      brandId,
      platform: prismaPlatform,
      isDeleted: false,
      isConnected: true,
    },
    select: { id: true },
  });
  const brand = await tx.brand.findFirst({
    where: { id: brandId, organizationId, isDeleted: false, isActive: true },
    select: { id: true },
  });
  if (!credential || !brand || !strategy.platforms.includes(platform))
    return { status: 'held', reason: 'account_unavailable' };
  const config = policySchema.safeParse(readArtifactRecord(strategy.config));
  const policies = readArtifactRecord(strategy.policies);
  const budgets = budgetSchema.safeParse(policies.budgetPolicy ?? {});
  if (!config.success || !budgets.success)
    return { status: 'held', reason: 'policy_unreadable' };
  const c = config.data;
  const b = budgets.data;
  if (
    b.perPlatformCaps.some(
      (row) => !Object.values(Platform).some((value) => value === row.key),
    ) ||
    b.perFormatCaps.some((row) => !formats.some((value) => value === row.key))
  )
    return { status: 'held', reason: 'policy_unreadable' };
  const usage = await readBreakoutMonthlyUsage(tx, {
    ...input,
    storedMonthlyUsed: c.monthToDateCreditsUsed,
  });
  if (usage.status === 'held') return usage;
  const monthly = Math.max(0, b.monthlyCreditBudget - usage.usedCredits);
  const scope = await resolveBillingAccountAccess(organizationId, tx);
  const wallet = await tx.creditBalance.findFirst({
    where: billingAccountScopedWhere(scope),
    orderBy: { createdAt: 'asc' },
    select: { balance: true, heldAmount: true, version: true },
  });
  if (
    !wallet ||
    !credits.safeParse(wallet.balance).success ||
    !credits.safeParse(wallet.heldAmount).success
  )
    return { status: 'held', reason: 'wallet_unavailable' };
  const now = new Date(input.nowMs);
  const days = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const expectedSpend = Number(
    ((b.monthlyCreditBudget / days) * now.getUTCDate()).toFixed(2),
  );
  const formatCaps: Partial<Record<LearningFormat, number | null>> = {};
  for (const format of formats) {
    const cap = b.perFormatCaps.find((row) => row.key === format);
    if (cap)
      formatCaps[format] = usage.dimensionUsage
        ? Math.min(
            monthly,
            Math.max(
              0,
              cap.creditBudget - (usage.dimensionUsage.formats[format] ?? 0),
            ),
          )
        : null;
  }
  const platformCap = b.perPlatformCaps.find((row) => row.key === platform);
  const policy = resolveCadencePolicy(c);
  const { start, end } = getCadenceWeek(c.timezone, now);
  const posts = await tx.post.findMany({
    where: {
      organizationId,
      brandId,
      agentStrategyId: strategyId,
      parentId: null,
      isDeleted: false,
      targetExecutionState: {
        in: [
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
          TargetExecutionState.PUBLISHED,
        ],
      },
      OR: [
        { publishedAt: { gte: start, lt: end } },
        { scheduledDate: { gte: start, lt: end } },
        { targetExecutionState: TargetExecutionState.PUBLISHING },
      ],
    },
    select: {
      id: true,
      groupId: true,
      publishedAt: true,
      scheduledDate: true,
      targetExecutionState: true,
    },
    take: 1001,
  });
  const groups = new Set(
    posts
      .filter((post) => {
        const at = cadencePublicationDate(post, now);
        return at && at >= start && at < end;
      })
      .map((post) => post.groupId || post.id),
  );
  const truncated = posts.length >= 1001;
  return {
    status: 'available',
    capturedAt: now.toISOString(),
    strategyId,
    walletVersion: wallet.version,
    capUsageBasis: usage.dimensionUsage
      ? 'monthly_ledger_and_reservations'
      : 'configured_cap_usage_unavailable',
    cadenceTruncated: truncated,
    remainingPublicationSlots: truncated
      ? null
      : Math.max(0, policy.ceiling - groups.size),
    budget: {
      remainingDailyCredits: Math.max(
        0,
        c.dailyCreditBudget - c.dailyCreditsUsed,
      ),
      remainingWeeklyCredits: Math.max(
        0,
        c.weeklyCreditBudget - c.creditsUsedThisWeek,
      ),
      remainingMonthlyCredits: monthly,
      availableOrganizationCredits: Math.max(
        0,
        wallet.balance - wallet.heldAmount,
      ),
      remainingPlatformCredits: platformCap
        ? usage.dimensionUsage
          ? Math.min(
              monthly,
              Math.max(
                0,
                platformCap.creditBudget -
                  (usage.dimensionUsage.platforms[platform] ?? 0),
              ),
            )
          : null
        : monthly,
      remainingPacingCredits:
        expectedSpend > 0 && usage.usedCredits > expectedSpend ? 0 : monthly,
      remainingFormatCredits: formatCaps,
    },
  };
}
