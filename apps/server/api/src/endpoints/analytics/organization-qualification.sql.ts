import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { EntityCountRow } from '@api/endpoints/analytics/analytics.types';
import {
  OrganizationEmailClassFilter,
  OrganizationUsageFilter,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { classifyEmail } from '@api/shared/utils/email-class/email-class.util';
import type { OrganizationCategory } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';

/**
 * How the admin organizations list qualifies a lead: the owner's email class
 * and lifetime usage, as SQL over `organizations e`. Kept beside the
 * leaderboard service so the ranking query and the total share one definition.
 */

export type PrismaSql = ReturnType<typeof Prisma.sql>;

/** Filters only organization lists take. */
export interface OrganizationListFilters {
  emailClass?: OrganizationEmailClassFilter;
  type?: OrganizationCategory;
  usage?: OrganizationUsageFilter;
}

/** Case-insensitive "contains" pattern with LIKE wildcards escaped. */
export function toContainsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

/**
 * Free-mail domains the owners of live organizations actually sign up with.
 * The maintained list holds ~30k domains; SQL is handed only the few hundred
 * in play, so the statement stays small and the answer is never stale.
 */
export async function resolvePersonalOwnerDomains(
  prisma: PrismaService,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ domain: string }[]>`
    SELECT DISTINCT lower(split_part(u."email", '@', 2)) AS domain
    FROM "organizations" o
    JOIN "users" u ON u."id" = o."userId"
    WHERE o."isDeleted" = false AND u."email" IS NOT NULL
  `;
  return rows
    .map((row) => row.domain)
    .filter((domain) => classifyEmail(`owner@${domain}`) === 'personal');
}

/**
 * The organization-only filters, as `AND ...` fragments over `organizations e`.
 * Shared by the ranking query and the total so both describe the same set.
 */
export function organizationListFilterSql(
  filters: OrganizationListFilters,
  personalDomains: string[],
): PrismaSql {
  // Declared at onboarding only: `category` always holds a default.
  const typeFilter = filters.type
    ? Prisma.sql`AND e."accountType" = ${filters.type}::"OrganizationCategory"`
    : Prisma.empty;

  const hasUsableEmail = Prisma.sql`u."email" IS NOT NULL
    AND position('@' in u."email") > 1
    AND split_part(u."email", '@', 2) LIKE '%.%'`;
  const ownerDomain = Prisma.sql`lower(split_part(u."email", '@', 2))`;
  let emailClassFilter = Prisma.empty;
  if (filters.emailClass === OrganizationEmailClassFilter.COMPANY) {
    emailClassFilter = Prisma.sql`AND EXISTS (
      SELECT 1 FROM "users" u
      WHERE u."id" = e."userId" AND ${hasUsableEmail}
        AND ${ownerDomain} <> ALL(${personalDomains}::text[]))`;
  } else if (filters.emailClass === OrganizationEmailClassFilter.PERSONAL) {
    emailClassFilter = Prisma.sql`AND EXISTS (
      SELECT 1 FROM "users" u
      WHERE u."id" = e."userId" AND ${hasUsableEmail}
        AND ${ownerDomain} = ANY(${personalDomains}::text[]))`;
  }

  const hasUsage = Prisma.sql`(
    EXISTS (
      SELECT 1 FROM "ingredients" i
      WHERE i."organizationId" = e."id" AND i."isDeleted" = false
        AND i."origin" = 'GENERATED'::"IngredientOrigin")
    OR EXISTS (
      SELECT 1 FROM "posts" p
      WHERE p."organizationId" = e."id" AND p."isDeleted" = false
        AND p."publishedAt" IS NOT NULL))`;
  let usageFilter = Prisma.empty;
  if (filters.usage === OrganizationUsageFilter.ACTIVE) {
    usageFilter = Prisma.sql`AND ${hasUsage}`;
  } else if (filters.usage === OrganizationUsageFilter.INACTIVE) {
    usageFilter = Prisma.sql`AND NOT ${hasUsage}`;
  }

  return Prisma.sql`${typeFilter} ${emailClassFilter} ${usageFilter}`;
}

/**
 * The organization total for filters Prisma's `where` cannot express (owner
 * email domain, lifetime usage). Same fragments as the ranking query.
 */
export async function countOrganizationsInSql(
  prisma: PrismaService,
  filters: {
    organizationId?: string;
    search?: string;
  } & OrganizationListFilters,
): Promise<number> {
  const personalDomains = filters.emailClass
    ? await resolvePersonalOwnerDomains(prisma)
    : [];
  const organizationIdFilter = filters.organizationId
    ? Prisma.sql`AND e."id" = ${filters.organizationId}`
    : Prisma.empty;
  const searchFilter = filters.search
    ? Prisma.sql`AND e."label" ILIKE ${toContainsPattern(filters.search)}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<{ total: bigint | number }[]>`
    SELECT COUNT(*) AS total
    FROM "organizations" e
    WHERE e."isDeleted" = false
      ${organizationIdFilter}
      ${organizationListFilterSql(filters, personalDomains)}
      ${searchFilter}
  `;
  return Number(rows[0]?.total ?? 0);
}

/** Lifetime generated assets per organization, for the given orgs. */
export async function countLifetimeGenerations(
  prisma: PrismaService,
  organizationIds: string[],
): Promise<Map<string, number>> {
  if (organizationIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<EntityCountRow[]>`
    SELECT "organizationId" AS entity_id, COUNT(*) AS total
    FROM "ingredients"
    WHERE "organizationId" = ANY(${organizationIds}::text[])
      AND "isDeleted" = false
      AND "origin" = 'GENERATED'::"IngredientOrigin"
    GROUP BY "organizationId"
  `;
  return new Map(rows.map((row) => [row.entity_id, Number(row.total)]));
}

/** Lifetime published posts per organization, for the given orgs. */
export async function countLifetimePosts(
  prisma: PrismaService,
  organizationIds: string[],
): Promise<Map<string, number>> {
  if (organizationIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<EntityCountRow[]>`
    SELECT "organizationId" AS entity_id, COUNT(*) AS total
    FROM "posts"
    WHERE "organizationId" = ANY(${organizationIds}::text[])
      AND "isDeleted" = false
      AND "publishedAt" IS NOT NULL
    GROUP BY "organizationId"
  `;
  return new Map(rows.map((row) => [row.entity_id, Number(row.total)]));
}

/**
 * The logo of each organization's oldest brand, for organizations that have no
 * logo asset of their own. One brand read and one batched logo read for the
 * whole page.
 */
export async function resolveFirstBrandLogos(
  prisma: PrismaService,
  brandsService: Pick<BrandsService, 'resolveBrandLogoUrls'>,
  organizationIds: string[],
): Promise<Map<string, string>> {
  if (organizationIds.length === 0) {
    return new Map();
  }

  const brands = await prisma.brand.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, organizationId: true },
    where: { isDeleted: false, organizationId: { in: organizationIds } },
  });
  const brandIdsByOrganization = new Map<string, string[]>();
  for (const brand of brands) {
    const brandIds = brandIdsByOrganization.get(brand.organizationId) ?? [];
    brandIds.push(brand.id);
    brandIdsByOrganization.set(brand.organizationId, brandIds);
  }
  if (brandIdsByOrganization.size === 0) {
    return new Map();
  }

  const logoByBrandId = await brandsService.resolveBrandLogoUrls(
    brandIdsByOrganization,
  );
  const logoByOrganization = new Map<string, string>();
  for (const [organizationId, brandIds] of brandIdsByOrganization) {
    const logo = brandIds
      .map((brandId) => logoByBrandId.get(brandId))
      .find((url): url is string => Boolean(url));
    if (logo) {
      logoByOrganization.set(organizationId, logo);
    }
  }
  return logoByOrganization;
}
