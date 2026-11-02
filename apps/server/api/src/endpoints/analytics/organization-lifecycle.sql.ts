import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  OrganizationLifecycleStatus,
  OrganizationSourceFilter,
} from '@genfeedai/contracts';
import type {
  IOrganizationConcierge,
  IWarmupAccountStatus,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';

/**
 * Where an organization stands, derived at read time and never stored. The
 * list shows it, filters by it and totals by it through this one expression, so
 * a row can never disagree with its filter.
 *
 * Order matters: what the organization pays for wins over onboarding, so a
 * paying customer who never finished the wizard is `subscribed`, not
 * `onboarding`. A cancelled subscription only counts when no live one exists.
 */

export type PrismaSql = ReturnType<typeof Prisma.sql>;

/** An enum value as a SQL string literal. Only ever called with our own enum members. */
const literal = (value: OrganizationLifecycleStatus): PrismaSql =>
  Prisma.raw(`'${value}'`);

const hasSubscription = (status: string): PrismaSql =>
  Prisma.sql`EXISTS (
    SELECT 1 FROM "subscriptions" s
    WHERE s."organizationId" = e."id" AND s."isDeleted" = false
      AND s."status" = ${Prisma.raw(`'${status}'`)}::"SubscriptionStatus")`;

/** `CASE` over `organizations e` yielding an {@link OrganizationLifecycleStatus} value. */
export function lifecycleStatusSql(): PrismaSql {
  return Prisma.sql`(CASE
    WHEN ${hasSubscription('ACTIVE')} THEN ${literal(OrganizationLifecycleStatus.SUBSCRIBED)}
    WHEN ${hasSubscription('TRIALING')} THEN ${literal(OrganizationLifecycleStatus.TRIAL)}
    WHEN ${hasSubscription('PAST_DUE')} THEN ${literal(OrganizationLifecycleStatus.PAST_DUE)}
    WHEN ${hasSubscription('CANCELLED')} THEN ${literal(OrganizationLifecycleStatus.CANCELLED)}
    WHEN e."onboardingCompleted" = false THEN ${literal(OrganizationLifecycleStatus.ONBOARDING)}
    ELSE ${literal(OrganizationLifecycleStatus.FREE)}
  END)`;
}

const HAS_CONCIERGE = Prisma.sql`EXISTS (
  SELECT 1 FROM "warmup_accounts" w
  WHERE w."organizationId" = e."id" AND w."isDeleted" = false)`;

export interface OrganizationLifecycleFilters {
  source?: OrganizationSourceFilter;
  status?: OrganizationLifecycleStatus;
}

/** The status and source filters, as `AND ...` fragments over `organizations e`. */
export function organizationLifecycleFilterSql(
  filters: OrganizationLifecycleFilters,
): PrismaSql {
  const statusFilter = filters.status
    ? Prisma.sql`AND ${lifecycleStatusSql()} = ${filters.status}`
    : Prisma.empty;
  let sourceFilter = Prisma.empty;
  if (filters.source === OrganizationSourceFilter.CONCIERGE) {
    sourceFilter = Prisma.sql`AND ${HAS_CONCIERGE}`;
  } else if (filters.source === OrganizationSourceFilter.SELF_SERVE) {
    sourceFilter = Prisma.sql`AND NOT ${HAS_CONCIERGE}`;
  }

  return Prisma.sql`${statusFilter} ${sourceFilter}`;
}

export interface OrganizationLifecycle {
  concierge?: IOrganizationConcierge;
  plan?: string;
  status: OrganizationLifecycleStatus;
}

interface LifecycleRow {
  id: string;
  plan: string | null;
  status: OrganizationLifecycleStatus;
}

/** Status, plan and concierge account for the organizations on one page. */
export async function resolveOrganizationLifecycles(
  prisma: PrismaService,
  organizationIds: string[],
): Promise<Map<string, OrganizationLifecycle>> {
  if (organizationIds.length === 0) {
    return new Map();
  }

  const [rows, conciergeAccounts] = await Promise.all([
    prisma.$queryRaw<LifecycleRow[]>`
      SELECT e."id" AS id, ${lifecycleStatusSql()} AS status,
        (
          SELECT s."plan" FROM "subscriptions" s
          WHERE s."organizationId" = e."id" AND s."isDeleted" = false
          ORDER BY CASE s."status"
            WHEN 'ACTIVE' THEN 1 WHEN 'TRIALING' THEN 2
            WHEN 'PAST_DUE' THEN 3 WHEN 'CANCELLED' THEN 4 ELSE 5 END,
            s."createdAt" DESC
          LIMIT 1
        ) AS plan
      FROM "organizations" e
      WHERE e."id" = ANY(${organizationIds}::text[])
    `,
    prisma.warmupAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, organizationId: true, status: true },
      where: { isDeleted: false, organizationId: { in: organizationIds } },
    }),
  ]);

  // The newest live concierge account per organization wins.
  const conciergeByOrganization = new Map<string, IOrganizationConcierge>();
  for (const account of conciergeAccounts) {
    if (
      account.organizationId &&
      !conciergeByOrganization.has(account.organizationId)
    ) {
      conciergeByOrganization.set(account.organizationId, {
        id: account.id,
        status: account.status as IWarmupAccountStatus,
      });
    }
  }

  const withPlan = new Set<OrganizationLifecycleStatus>([
    OrganizationLifecycleStatus.SUBSCRIBED,
    OrganizationLifecycleStatus.TRIAL,
    OrganizationLifecycleStatus.PAST_DUE,
    OrganizationLifecycleStatus.CANCELLED,
  ]);

  return new Map(
    rows.map((row) => [
      row.id,
      {
        concierge: conciergeByOrganization.get(row.id),
        plan: withPlan.has(row.status) && row.plan ? row.plan : undefined,
        status: row.status,
      },
    ]),
  );
}

/** An organization's lifecycle from {@link resolveOrganizationLifecycles}; free when none was found. */
export function lifecycleOf(
  lifecycles: Map<string, OrganizationLifecycle>,
  organizationId: string,
): OrganizationLifecycle {
  return (
    lifecycles.get(organizationId) ?? {
      status: OrganizationLifecycleStatus.FREE,
    }
  );
}
