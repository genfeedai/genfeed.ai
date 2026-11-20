import { resolveArticleBrandContext } from '@api/collections/articles/utils/article-brand-context.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

describe('resolveArticleBrandContext', () => {
  const organizationId = 'org_1';
  const activeBrandId = 'brand_active';

  function buildPrisma(brandsOfOrganization: string[]) {
    const findFirst = vi.fn(
      async (args: { where: { id: string; organizationId: string } }) =>
        args.where.organizationId === organizationId &&
        brandsOfOrganization.includes(args.where.id)
          ? { id: args.where.id }
          : null,
    );
    return { brand: { findFirst } } as unknown as PrismaService;
  }

  it('keeps the active brand when the call names none or the same one', async () => {
    const prisma = buildPrisma([]);

    await expect(
      resolveArticleBrandContext(
        prisma,
        organizationId,
        activeBrandId,
        undefined,
        undefined,
      ),
    ).resolves.toBe(activeBrandId);
    await expect(
      resolveArticleBrandContext(
        prisma,
        organizationId,
        activeBrandId,
        activeBrandId,
        ['brand_other'],
      ),
    ).resolves.toBe(activeBrandId);
  });

  it('accepts another brand of the organization', async () => {
    await expect(
      resolveArticleBrandContext(
        buildPrisma(['brand_other']),
        organizationId,
        activeBrandId,
        'brand_other',
        undefined,
      ),
    ).resolves.toBe('brand_other');
  });

  it('accepts a brand of a key limited to some brands only when it is listed', async () => {
    const prisma = buildPrisma(['brand_other', 'brand_third']);

    await expect(
      resolveArticleBrandContext(
        prisma,
        organizationId,
        activeBrandId,
        'brand_other',
        ['brand_other'],
      ),
    ).resolves.toBe('brand_other');
    await expect(
      resolveArticleBrandContext(
        prisma,
        organizationId,
        activeBrandId,
        'brand_third',
        ['brand_other'],
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reads a brand of another organization as not found', async () => {
    await expect(
      resolveArticleBrandContext(
        buildPrisma([]),
        organizationId,
        activeBrandId,
        'brand_foreign',
        undefined,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
