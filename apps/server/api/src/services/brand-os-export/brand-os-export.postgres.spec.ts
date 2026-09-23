import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandOsExportService } from '@api/services/brand-os-export/brand-os-export.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const databaseUrl = process.env.BRAND_OS_TEST_DATABASE_URL;
const actor: AuthenticatedUser = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
};
const content = (label: string) => ({
  fields: {
    label: { currentValue: label, evidence: [{ sourceType: 'manual' }] },
    description: {
      currentValue: 'Clear tools for creative teams.',
      evidence: [{ sourceType: 'system' }],
    },
    voiceAudience: {
      currentValue: ['Founders', 'Creators'],
      evidence: [{ sourceType: 'manual' }],
    },
  },
});

describe.skipIf(!databaseUrl)('Brand OS export with real PostgreSQL', () => {
  const schema = `brand_os_export_${randomUUID().replaceAll('-', '')}`;
  let control: Pool;
  let scoped: Pool;
  let prisma: PrismaClient;
  let service: BrandOsExportService;
  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error(
        'Brand OS database tests require an explicitly configured local test database',
      );
    control = new Pool({ connectionString: databaseUrl });
    await control.query(`CREATE SCHEMA "${schema}"`);
    scoped = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    await scoped.query(`
      CREATE TABLE "users" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "organizations" ("id" TEXT PRIMARY KEY, "isDeleted" BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE "brands" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "organizations"("id"), "isDeleted" BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE "roles" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL);
      CREATE TABLE "members" ("id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "roleId" TEXT NOT NULL REFERENCES "roles"("id"), "roleKey" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "isDeleted" BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE "activities" ("id" TEXT PRIMARY KEY, "userId" TEXT, "organizationId" TEXT, "brandId" TEXT, "entityId" TEXT, "entityModel" TEXT, "action" TEXT, "data" JSONB, "isDeleted" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
      INSERT INTO "users" VALUES ('user-1');
      INSERT INTO "organizations" ("id") VALUES ('org-1'), ('other-org');
      INSERT INTO "brands" ("id", "organizationId") VALUES ('brand-1', 'org-1');
      INSERT INTO "roles" VALUES ('role-1', 'owner');
      INSERT INTO "members" ("id", "organizationId", "userId", "roleId", "roleKey") VALUES ('member-1', 'org-1', 'user-1', 'role-1', 'owner');
    `);
    const migration = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../../../packages/prisma/prisma/migrations/20260914150000_brand_os_revisions/migration.sql',
      ),
      'utf8',
    );
    await scoped.query(migration);
    prisma = new PrismaClient({ adapter: new PrismaPg(scoped, { schema }) });
    service = new BrandOsExportService(
      prisma as unknown as PrismaService,
      {
        apiUrl: 'https://api.public.example.com',
        get: () => 'http://api.internal.example.com:3010',
      } as unknown as ConfigService,
      { log: vi.fn() } as unknown as LoggerService,
    );
  }, 30_000);
  afterAll(async () => {
    await prisma?.$disconnect();
    await scoped?.end();
    if (control) {
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.end();
    }
  });
  it('completes publication lifecycle, permission denial, audit retention and warm p95 under 300ms', async () => {
    expect((await service.state('brand-1', actor)).state).toBe('unavailable');
    await prisma.brandOsRevision.create({
      data: {
        approvedAt: new Date('2026-09-14T00:00:00Z'),
        approvedById: 'user-1',
        brandId: 'brand-1',
        content: content('First Brand'),
        id: 'rev-1',
        organizationId: 'org-1',
        status: 'APPROVED',
        version: 1,
      },
    });
    expect((await service.state('brand-1', actor)).state).toBe('private');
    const privateArtifact = await service.download('brand-1', actor);
    expect(await service.download('brand-1', actor)).toEqual(privateArtifact);
    const published = await service.publish('brand-1', 'rev-1', actor);
    expect(published.state).toBe('published');
    expect(published.publicUrl).toContain(
      'https://api.public.example.com/v1/public/brand-os/',
    );
    const publication = await prisma.brandOsPublication.findFirstOrThrow({
      where: { brandId: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    const original = await service.publicArtifact(publication.id);
    await prisma.$transaction(async (tx) => {
      await tx.brandOsRevision.updateMany({
        data: { status: 'SUPERSEDED' },
        where: {
          brandId: 'brand-1',
          id: 'rev-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      await tx.brandOsRevision.create({
        data: {
          approvedAt: new Date('2026-09-14T01:00:00Z'),
          approvedById: 'user-1',
          brandId: 'brand-1',
          content: content('Second Brand'),
          id: 'rev-2',
          organizationId: 'org-1',
          status: 'APPROVED',
          version: 2,
        },
      });
    });
    expect(await service.publicArtifact(publication.id)).toEqual(original);
    await Promise.all([
      service.publish('brand-1', 'rev-2', actor),
      service.publish('brand-1', 'rev-2', actor),
    ]);
    expect((await service.publicArtifact(publication.id)).revisionId).toBe(
      'rev-2',
    );
    expect(await service.publicArtifact(publication.id, 'rev-1')).toEqual(
      original,
    );
    const elapsed: number[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const start = performance.now();
      await service.publicArtifact(publication.id);
      elapsed.push(performance.now() - start);
    }
    elapsed.sort((a, b) => a - b);
    const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1];
    process.stdout.write(
      `Brand OS real PostgreSQL warm retrieval p95: ${p95.toFixed(2)} ms (${elapsed.length} samples)\n`,
    );
    expect(p95).toBeLessThan(300);
    await expect(
      service.download('brand-1', { ...actor, organizationId: 'other-org' }),
    ).rejects.toMatchObject({ status: 404 });
    await scoped.query('UPDATE "roles" SET "key" = $1 WHERE "id" = $2', [
      'user',
      'role-1',
    ]);
    await scoped.query('UPDATE "members" SET "roleKey" = $1 WHERE "id" = $2', [
      'user',
      'member-1',
    ]);
    await expect(service.revoke('brand-1', actor)).rejects.toMatchObject({
      status: 404,
    });
    await scoped.query('UPDATE "roles" SET "key" = $1 WHERE "id" = $2', [
      'owner',
      'role-1',
    ]);
    await scoped.query('UPDATE "members" SET "roleKey" = $1 WHERE "id" = $2', [
      'owner',
      'member-1',
    ]);
    await service.revoke('brand-1', actor);
    await expect(service.publicArtifact(publication.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.publicArtifact(publication.id, 'rev-1'),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.download('brand-1', actor)).revisionId).toBe('rev-2');
    await service.publish('brand-1', 'rev-2', actor);
    await expect(
      service.publicArtifact(publication.id, 'rev-1'),
    ).rejects.toMatchObject({ status: 404 });
    await scoped.query(
      'UPDATE "brands" SET "isDeleted" = true WHERE "id" = $1',
      ['brand-1'],
    );
    await expect(service.publicArtifact(publication.id)).rejects.toMatchObject({
      status: 404,
    });
    await scoped.query(
      'UPDATE "brands" SET "isDeleted" = false WHERE "id" = $1',
      ['brand-1'],
    );
    await scoped.query(
      'UPDATE "brand_os_publications" SET "isDeleted" = true WHERE "id" = $1',
      [publication.id],
    );
    await expect(
      service.publish('brand-1', 'rev-2', actor),
    ).rejects.toMatchObject({ status: 409 });
    const tombstone = await scoped.query(
      'SELECT "isDeleted" FROM "brand_os_publications" WHERE "id" = $1',
      [publication.id],
    );
    expect(tombstone.rows[0].isDeleted).toBe(true);
    await expect(service.publicArtifact(publication.id)).rejects.toMatchObject({
      status: 404,
    });
    const audits = await prisma.activity.findMany({
      where: { brandId: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(
      audits.some((audit) => audit.action === 'brand_os.export.revoke'),
    ).toBe(true);
    expect(audits.every((audit) => audit.data === null)).toBe(true);
    expect(JSON.stringify(audits)).not.toContain('First Brand');
    expect(JSON.stringify(audits)).not.toContain('Second Brand');
  }, 30_000);
});
