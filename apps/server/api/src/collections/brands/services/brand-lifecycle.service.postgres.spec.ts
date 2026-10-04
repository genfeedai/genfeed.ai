import { randomUUID } from 'node:crypto';
import { BrandLifecycleService } from '@api/collections/brands/services/brand-lifecycle.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
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

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BRAND_DELETE_SAFETY_TEST_DATABASE_URL;

/**
 * Real Postgres end-to-end coverage for #5295: `BrandLifecycleService.remove()`
 * and `.selectBrandForUser()` must be atomic against each other. Before this
 * fix, `BrandsService.remove()` read a fallback brand, moved members, and
 * soft-deleted across three unguarded statements — two concurrent deletes of
 * an org's last two brands could each see a live fallback and both succeed,
 * leaving zero live brands. This suite proves the `FOR UPDATE` lock actually
 * serializes concurrent transactions under a real database, which a mocked
 * unit test cannot: the mock's `$transaction` just calls the callback
 * inline, so it cannot exercise real lock contention.
 */
describe.skipIf(!connectionString)(
  'BrandLifecycleService delete safety PostgreSQL end-to-end (#5295)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BRAND_DELETE_SAFETY_TEST_DATABASE_URL is required');
      }
      return prisma;
    };

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const cacheInvalidationService = {
      invalidate: vi.fn().mockResolvedValue(undefined),
      invalidateByTags: vi.fn().mockResolvedValue(undefined),
    };
    const accessBootstrapCacheService = {
      invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
    };
    const userAccessCacheService = {
      invalidateAll: vi.fn().mockResolvedValue(undefined),
    };

    const makeService = () =>
      new BrandLifecycleService(
        prisma as unknown as PrismaService,
        logger as never,
        { invalidateByTags: vi.fn() } as never,
        cacheInvalidationService as never,
        accessBootstrapCacheService as never,
        userAccessCacheService as never,
      );

    let userId: string;
    let organizationId: string;
    let roleId: string;
    let brandIds: [string, string];
    let memberIds: [string, string];

    beforeEach(async () => {
      vi.clearAllMocks();
      const suffix = randomUUID();
      userId = `brand-del-user-${suffix}`;
      organizationId = `brand-del-org-${suffix}`;
      brandIds = [`brand-del-a-${suffix}`, `brand-del-b-${suffix}`];
      memberIds = [
        `brand-del-member-a-${suffix}`,
        `brand-del-member-b-${suffix}`,
      ];

      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.user.create({
        data: { handle: `${userId}-a`, id: `${userId}-a` },
      });
      await db.user.create({
        data: { handle: `${userId}-b`, id: `${userId}-b` },
      });
      await db.organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId,
        },
      });

      const role = await db.role.create({
        data: { key: `brand-del-role-${suffix}`, label: 'Owner' },
      });
      roleId = role.id;

      // Two live brands — this org's minimum before either delete is allowed.
      await db.brand.create({
        data: {
          id: brandIds[0],
          label: brandIds[0],
          organizationId,
          slug: brandIds[0],
          userId,
        },
      });
      await db.brand.create({
        data: {
          id: brandIds[1],
          label: brandIds[1],
          organizationId,
          slug: brandIds[1],
          userId,
        },
      });

      // One member pointed at each brand, so a delete's member-reassignment
      // and the identity/context cache invalidation it triggers both have a
      // real row to move.
      await db.member.create({
        data: {
          currentBrandId: brandIds[0],
          id: memberIds[0],
          isActive: true,
          organizationId,
          roleId,
          roleKey: MemberRole.OWNER,
          userId: `${userId}-a`,
        },
      });
      await db.member.create({
        data: {
          currentBrandId: brandIds[1],
          id: memberIds[1],
          isActive: true,
          organizationId,
          roleId,
          roleKey: MemberRole.OWNER,
          userId: `${userId}-b`,
        },
      });
    });

    afterEach(async () => {
      const db = database();
      await db.member.deleteMany({ where: { organizationId } });
      await db.brand.deleteMany({ where: { organizationId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
      await db.role.delete({ where: { id: roleId } });
      await db.user.deleteMany({
        where: { id: { in: [userId, `${userId}-a`, `${userId}-b`] } },
      });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("leaves exactly one live brand when two deletes of the org's last two brands race, and rejects the second with a 409", async () => {
      const serviceA = makeService();
      const serviceB = makeService();

      const results = await Promise.allSettled([
        serviceA.remove(organizationId, brandIds[0]),
        serviceB.remove(organizationId, brandIds[1]),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      );

      const db = database();
      const liveBrands = await db.brand.findMany({
        where: { isDeleted: false, organizationId },
      });
      expect(liveBrands).toHaveLength(1);

      // Every member of the org must resolve to the one surviving brand — the
      // deleted brand's member was reassigned, and the surviving brand's
      // member was left untouched.
      const members = await db.member.findMany({
        where: { organizationId },
      });
      for (const member of members) {
        expect(member.currentBrandId).toBe(liveBrands[0]?.id);
      }
    });

    it('never leaves a member pointed at a brand deleted underneath a concurrent selectBrandForUser', async () => {
      const removeService = makeService();
      const selectService = makeService();
      const switchingUserId = `${userId}-a`;

      // memberIds[0]/switchingUserId already points at brandIds[0]; race a
      // switch onto brandIds[1] against a concurrent delete of brandIds[1].
      const [removeResult, selectResult] = await Promise.allSettled([
        removeService.remove(organizationId, brandIds[1]),
        selectService.selectBrandForUser(
          brandIds[1],
          switchingUserId,
          organizationId,
        ),
      ]);

      // Nothing about a brand switch threatens remove()'s fallback, so the
      // delete always succeeds regardless of which transaction's lock query
      // wins the race; only the switch's outcome depends on timing.
      expect(removeResult.status).toBe('fulfilled');
      if (selectResult.status === 'rejected') {
        // The delete's lock won: by the time the switch resumed, brandIds[1]
        // no longer resolved as a live brand.
        expect(selectResult.reason).toBeInstanceOf(NotFoundException);
      }

      const db = database();
      const member = await db.member.findFirstOrThrow({
        where: { organizationId, userId: switchingUserId },
      });
      const deletedBrand = await db.brand.findUniqueOrThrow({
        where: { id: brandIds[1] },
      });

      // Whichever order won: the target brand ends up deleted, this member
      // is never left pointing at it, and wherever it does point is live.
      expect(deletedBrand.isDeleted).toBe(true);
      expect(member.currentBrandId).not.toBe(brandIds[1]);
      const finalBrand = await db.brand.findUniqueOrThrow({
        where: { id: member.currentBrandId },
      });
      expect(finalBrand.isDeleted).toBe(false);
    });
  },
);
