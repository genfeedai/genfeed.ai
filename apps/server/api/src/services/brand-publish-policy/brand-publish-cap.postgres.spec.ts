import { randomUUID } from 'node:crypto';
import {
  type BrandPolicyDraftFacts,
  BrandPublishPolicyService,
} from '@api/services/brand-publish-policy/brand-publish-policy.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import {
  createDefaultBrandPublishPolicy,
  evaluateBrandPublishPolicyRules,
} from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
// Share CI's explicitly provisioned verification DB; isolate every fixture in
// its own schema. Never use DATABASE_URL or production configuration.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

describe.skipIf(!connectionString)(
  'brand Policy post caps PostgreSQL concurrency (#7458)',
  () => {
    const schema = `policy_caps_${randomUUID().replaceAll('-', '')}`;
    const organizationId = 'organization';
    const publishAt = new Date('2026-10-20T10:00:00.000Z');
    let pool: Pool;
    let prisma: PrismaClient;
    let service: BrandPublishPolicyService;

    beforeAll(async () => {
      if (!connectionString)
        throw new Error('Explicit disposable database required');
      const url = new URL(connectionString);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !['/billing_scope_test', '/genfeed_6507_disposable'].includes(
          url.pathname,
        )
      )
        throw new Error('Disposable local database required');
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(
        `CREATE TYPE "${schema}"."BrandOsRevisionStatus" AS ENUM ('DRAFT','APPROVED','SUPERSEDED')`,
      );
      await pool.query(
        `CREATE TABLE "${schema}"."brand_os_revisions" ("id" text PRIMARY KEY, "organizationId" text, "brandId" text, "status" "${schema}"."BrandOsRevisionStatus", "content" jsonb NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false)`,
      );
      await pool.query(
        `CREATE TABLE "${schema}"."brands" ("id" text PRIMARY KEY, "organizationId" text, "agentConfig" jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false)`,
      );
      await pool.query(
        `CREATE TABLE "${schema}"."profiles" ("id" text PRIMARY KEY, "organizationId" text, "data" jsonb NOT NULL DEFAULT '{}', "isDeleted" boolean NOT NULL DEFAULT false, "updatedAt" timestamp(3))`,
      );
      await pool.query(
        `CREATE TABLE "${schema}"."posts" ("id" text PRIMARY KEY, "brandId" text, "organizationId" text, "isDeleted" boolean NOT NULL DEFAULT false, "parentId" text, "publishedAt" timestamp(3), "scheduledDate" timestamp(3), "targetExecutionState" text)`,
      );
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
      service = new BrandPublishPolicyService(
        prisma as unknown as PrismaService,
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });

    /** A brand whose approved Policy allows one post a day. */
    async function seedBrand(): Promise<string> {
      const brandId = randomUUID();
      await pool.query(
        `INSERT INTO "${schema}"."brands" ("id","organizationId") VALUES ($1,$2)`,
        [brandId, organizationId],
      );
      await pool.query(
        `INSERT INTO "${schema}"."brand_os_revisions" ("id","organizationId","brandId","status","content") VALUES ($1,$2,$3,'APPROVED',$4)`,
        [
          randomUUID(),
          organizationId,
          brandId,
          JSON.stringify({
            policy: {
              ...createDefaultBrandPublishPolicy(),
              maxPostsPerDay: 1,
              maxPostsPerWeek: 5,
            },
          }),
        ],
      );
      return brandId;
    }

    function factsFor(brandId: string): BrandPolicyDraftFacts {
      return {
        brandId,
        format: 'text',
        organizationId,
        platform: 'twitter',
        publishAt,
        text: 'A calm launch note.',
      };
    }

    async function countScheduled(brandId: string): Promise<number> {
      const rows = await pool.query(
        `SELECT "id" FROM "${schema}"."posts" WHERE "brandId"=$1`,
        [brandId],
      );
      return rows.rowCount ?? 0;
    }

    async function insertScheduled(
      client: Pick<PrismaClient, '$executeRaw'>,
      brandId: string,
    ): Promise<void> {
      // Slow enough that an unlocked second publish counts before this lands.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await client.$executeRaw`INSERT INTO "posts" ("id","brandId","organizationId","scheduledDate","targetExecutionState") VALUES (${randomUUID()},${brandId},${organizationId},${publishAt},${TargetExecutionState.SCHEDULED})`;
    }

    /** What a service writing through its own connections does: judge, lock, evaluate again, write. */
    async function publishUnderLock(
      brandId: string,
    ): Promise<'held' | 'scheduled'> {
      const isHeld = async () =>
        evaluateBrandPublishPolicyRules(
          await service.buildEvaluation(factsFor(brandId), {
            isJudgeEnabled: false,
          }),
        ).length > 0;
      if (await isHeld()) return 'held';
      return service.withPostCapLock(
        { brandId, organizationId },
        async (isLocked) => {
          if (isLocked && (await isHeld())) return 'held';
          await insertScheduled(prisma, brandId);
          return 'scheduled';
        },
      );
    }

    /** What a transactional caller does: evaluate and write in one transaction. */
    async function publishInTransaction(
      brandId: string,
    ): Promise<'held' | 'scheduled'> {
      return prisma.$transaction(async (tx) => {
        const input = await service.buildEvaluation(
          factsFor(brandId),
          { isJudgeEnabled: false },
          tx,
        );
        if (evaluateBrandPublishPolicyRules(input).length > 0) return 'held';
        await insertScheduled(tx, brandId);
        return 'scheduled';
      });
    }

    it('admits one of two concurrent publishes for the last slot when each locks around its own write', async () => {
      const brandId = await seedBrand();

      const results = await Promise.all([
        publishUnderLock(brandId),
        publishUnderLock(brandId),
      ]);

      expect([...results].sort()).toEqual(['held', 'scheduled']);
      expect(await countScheduled(brandId)).toBe(1);
    });

    it('admits one of two concurrent publishes for the last slot when each evaluates and writes in one transaction', async () => {
      const brandId = await seedBrand();

      const results = await Promise.all([
        publishInTransaction(brandId),
        publishInTransaction(brandId),
      ]);

      expect([...results].sort()).toEqual(['held', 'scheduled']);
      expect(await countScheduled(brandId)).toBe(1);
    });

    it('admits one of several mixed concurrent publishes', async () => {
      const brandId = await seedBrand();

      const results = await Promise.all([
        publishInTransaction(brandId),
        publishUnderLock(brandId),
        publishInTransaction(brandId),
        publishUnderLock(brandId),
      ]);

      expect(results.filter((result) => result === 'scheduled')).toHaveLength(
        1,
      );
      expect(await countScheduled(brandId)).toBe(1);
    });

    it('does not make one brand wait for another brand', async () => {
      const [first, second] = [await seedBrand(), await seedBrand()];

      const results = await Promise.all([
        publishInTransaction(first),
        publishUnderLock(second),
      ]);

      expect(results).toEqual(['scheduled', 'scheduled']);
    });

    it('leaves no slot taken when the write fails', async () => {
      const brandId = await seedBrand();

      await expect(
        service.withPostCapLock({ brandId, organizationId }, async () => {
          throw new Error('post write failed');
        }),
      ).rejects.toThrow('post write failed');

      expect(await countScheduled(brandId)).toBe(0);
      expect(await publishUnderLock(brandId)).toBe('scheduled');
    });
  },
);
