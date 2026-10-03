import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
// Explicit pre-existing disposable database only. Never use DATABASE_URL or provision/migrate a database.
const connectionString = process.env.IMPORTED_SOURCE_TEST_DATABASE_URL;
if (connectionString !== undefined) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      'IMPORTED_SOURCE_TEST_DATABASE_URL must name a safe disposable local database.',
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/genfeed_5859_disposable')
  )
    throw new Error(
      'IMPORTED_SOURCE_TEST_DATABASE_URL must name a safe disposable local database.',
    );
}
describe.skipIf(!connectionString)(
  'imported-source real PostgreSQL concurrency',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    function database() {
      if (!prisma)
        throw new Error(
          'Explicit imported-source disposable database is required.',
        );
      return prisma;
    }
    let user: AuthenticatedUser;
    let service: ImportedSourcesService;
    const input = {
      snapshot: {
        kind: 'page',
        canonicalUrl: 'https://example.com/source',
        title: 'Original',
        capturedText: 'Original excerpt',
        contentBasis: 'visible_page',
      },
    };
    beforeEach(async () => {
      user = {
        id: randomUUID(),
        userId: randomUUID(),
        organizationId: randomUUID(),
        brandId: randomUUID(),
      };
      const db = database();
      await db.user.create({
        data: { id: user.userId, handle: `imported-source-${user.userId}` },
      });
      await db.organization.create({
        data: {
          id: user.organizationId,
          label: 'Imported source fixture',
          slug: `imported-source-${user.organizationId}`,
          userId: user.userId,
        },
      });
      await db.brand.create({
        data: {
          id: user.brandId,
          label: 'Imported source fixture',
          slug: `imported-source-${user.brandId}`,
          organizationId: user.organizationId,
          userId: user.userId,
        },
      });
      service = new ImportedSourcesService(db as unknown as PrismaService);
    });
    afterEach(async () => {
      if (!user) return;
      const db = database();
      for (const isDeleted of [false, true])
        await db.ingredient.deleteMany({
          where: {
            organizationId: user.organizationId,
            brandId: user.brandId,
            isDeleted,
          },
        });
      await db.brand.deleteMany({
        where: { id: user.brandId, organizationId: user.organizationId },
      });
      await db.organization.deleteMany({
        where: { id: user.organizationId, userId: user.userId },
      });
      await db.user.deleteMany({ where: { id: user.userId } });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });
    it('twelve concurrent real saves produce exactly one active scoped immutable row', async () => {
      const outputs = await Promise.all(
        Array.from({ length: 12 }, () =>
          service.save(user, user.brandId, input),
        ),
      );
      expect(new Set(outputs.map((output) => output.id)).size).toBe(1);
      const rows = await database().ingredient.findMany({
        where: {
          organizationId: user.organizationId,
          brandId: user.brandId,
          isDeleted: false,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(user.userId);
      expect(outputs.filter((output) => !output.deduplicated)).toHaveLength(1);
    });
    it('concurrent same/distinct recapture keys yield one successor and leave original unchanged', async () => {
      const first = await service.save(user, user.brandId, input);
      await database().ingredient.updateMany({
        where: {
          id: first.id,
          organizationId: user.organizationId,
          brandId: user.brandId,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      const deleted = await database().ingredient.findFirst({
        where: {
          id: first.id,
          organizationId: user.organizationId,
          brandId: user.brandId,
          isDeleted: true,
        },
      });
      const shared = randomUUID();
      const outputs = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          service.recapture(user, user.brandId, first.id, {
            requestId: index < 6 ? shared : randomUUID(),
          }),
        ),
      );
      expect(new Set(outputs.map((output) => output.id)).size).toBe(1);
      const active = await database().ingredient.findMany({
        where: {
          organizationId: user.organizationId,
          brandId: user.brandId,
          isDeleted: false,
        },
      });
      expect(active).toHaveLength(1);
      expect(active[0].version).toBe(2);
      expect(
        await database().ingredient.findFirst({
          where: {
            id: first.id,
            organizationId: user.organizationId,
            brandId: user.brandId,
            isDeleted: true,
          },
        }),
      ).toEqual(deleted);
    });
  },
);
