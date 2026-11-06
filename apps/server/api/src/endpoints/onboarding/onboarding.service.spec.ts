/**
 * Regression tests for #564 — OrganizationCategory enum mapping (onboarding write path).
 *
 * The install-readiness failure path:
 *   GET /v1/onboarding/install-readiness
 *   → OnboardingService.ensureOnboardingWorkspace()
 *   → UserSetupService.initializeUserResources(userId, category?)
 *   → organizationsService.create({ category: 'business' })   ← app-form
 *   → OrganizationsService.create() normalises to 'BUSINESS'  ← Prisma-form
 *   → prisma.organization.create({ data: { category: 'BUSINESS' } }) ✓
 *
 * OrganizationsService is the boundary that fixes the bug. These tests write
 * through it into an in-memory organization table and read back what was
 * persisted.
 */

// Real, complete OrganizationCategory + real getModelMeta/
// PRISMA_MODEL_METADATA.Organization via the light @genfeedai/prisma/testing
// subpath.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { OrganizationCategory } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

type CreateInput = Parameters<OrganizationsService['create']>[0];
type PatchInput = Parameters<OrganizationsService['patch']>[1];
type Row = Record<string, unknown> & { id: string };

describe('Onboarding path — regression #564: OrganizationCategory enum mapping', () => {
  let organizations: Map<string, Row>;
  let organizationsService: OrganizationsService;

  const matches = (row: Row, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([key, value]) =>
      typeof value === 'object' && value !== null ? true : row[key] === value,
    );

  beforeEach(() => {
    organizations = new Map([['org_1', { accountType: null, id: 'org_1' }]]);
    let nextId = 1;

    organizationsService = new OrganizationsService(
      {
        organization: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const row = { ...data, id: `org_reg564_${nextId++}` };
            organizations.set(row.id, row);
            return row;
          },
          findFirst: async ({ where }: { where?: Record<string, unknown> }) =>
            [...organizations.values()].find((row) => matches(row, where)) ??
            null,
          update: async ({
            data,
            where,
          }: {
            data: Record<string, unknown>;
            where: { id: string };
          }) => {
            const row = { ...organizations.get(where.id), ...data } as Row;
            organizations.set(where.id, row);
            return row;
          },
        },
      } as unknown as PrismaService,
      {
        debug: () => {},
        error: () => {},
        log: () => {},
        warn: () => {},
      } as unknown as LoggerService,
    );
  });

  const create = (category: string, slug: string) =>
    organizationsService.create({
      category: category as OrganizationCategory,
      label: slug,
      slug,
      userId: 'user_1',
    } as unknown as CreateInput);

  it.each([
    [OrganizationCategory.BUSINESS, 'BUSINESS'],
    [OrganizationCategory.CREATOR, 'CREATOR'],
    [OrganizationCategory.AGENCY, 'AGENCY'],
    ['BUSINESS', 'BUSINESS'],
  ])('persists category %s as Prisma %s', async (category, persisted) => {
    await create(category, 'default-organization');

    expect([...organizations.values()].at(-1)).toMatchObject({
      category: persisted,
      slug: 'default-organization',
    });
  });

  it('also normalises the accountType field on patch', async () => {
    await organizationsService.patch('org_1', {
      accountType: OrganizationCategory.CREATOR,
    } as unknown as PatchInput);

    expect(organizations.get('org_1')).toMatchObject({
      accountType: 'CREATOR',
    });
  });

  it('rejects an unrecognised category before anything is written', () => {
    // create() normalises the category synchronously, before its first await,
    // so the throw escapes before a promise is returned.
    expect(() => create('personal', 'bad-org')).toThrow(BadRequestException);
    expect(organizations.size).toBe(1);
  });
});
