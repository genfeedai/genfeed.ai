import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Runs against the fully migrated disposable database CI provisions for the
 * billing-account-scope suites. Every test runs in a transaction that is
 * rolled back, with foreign keys relaxed for its rows
 * (`session_replication_role = replica`, which needs a superuser).
 */
vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
if (connectionString !== undefined) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/billing_scope_test'
  ) {
    throw new Error('A disposable local database is required.');
  }
}

class RollbackSignal extends Error {}

describe.skipIf(!connectionString)(
  'Brand.isPublicAnalyticsEnabled on real PostgreSQL',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function inRolledBackTransaction(
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ): Promise<void> {
      if (!prisma) {
        throw new Error('Database is not configured.');
      }
      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
          await work(tx);
          throw new RollbackSignal();
        })
        .catch((error: unknown) => {
          if (!(error instanceof RollbackSignal)) {
            throw error;
          }
        });
    }

    const brandData = (id: string) => ({
      backgroundColor: '#000000',
      description: '',
      fontFamily: 'MONTSERRAT_BLACK' as const,
      id,
      label: id,
      organizationId: 'org-1',
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      slug: id,
      userId: 'user-1',
    });

    it('is on for a brand that never chose, so no public profile loses its numbers', async () => {
      await inRolledBackTransaction(async (tx) => {
        await tx.brand.create({ data: brandData('brand-default') });

        const brand = await tx.brand.findUniqueOrThrow({
          select: { isPublicAnalyticsEnabled: true },
          where: { id: 'brand-default' },
        });

        expect(brand.isPublicAnalyticsEnabled).toBe(true);
      });
    });

    it('keeps the owner turning it off, for that brand only', async () => {
      await inRolledBackTransaction(async (tx) => {
        await tx.brand.create({ data: brandData('brand-off') });
        await tx.brand.create({ data: brandData('brand-other') });

        await tx.brand.update({
          data: { isPublicAnalyticsEnabled: false },
          where: { id: 'brand-off' },
        });

        const rows = await tx.brand.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, isPublicAnalyticsEnabled: true },
          where: { id: { in: ['brand-off', 'brand-other'] } },
        });
        expect(rows).toEqual([
          { id: 'brand-off', isPublicAnalyticsEnabled: false },
          { id: 'brand-other', isPublicAnalyticsEnabled: true },
        ]);
      });
    });
  },
);
