import { randomUUID } from 'node:crypto';
import { IngredientVersionsService } from '@api/collections/ingredients/services/ingredient-versions.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * Asset version history against real Prisma and PostgreSQL (#7397, #7395):
 * ordering, the active version, restore without deleting, derivatives and
 * legacy links kept out of the history, and tenant and brand isolation.
 */
describe.skipIf(!connectionString)(
  'IngredientVersionsService PostgreSQL (#7397)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };
    const suffix = randomUUID().slice(0, 8);
    const id = (name: string) => `versions-${name}-${suffix}`;
    const userId = id('user');
    const orgA = id('org-a');
    const orgB = id('org-b');
    const brandA1 = id('brand-a1');
    const brandA2 = id('brand-a2');
    const brandB1 = id('brand-b1');
    const first = id('first');
    const second = id('second');
    const third = id('third');
    const crop = id('crop');
    const legacy = id('legacy');
    const loneAsset = id('lone');
    const viewer = {
      brandId: brandA1,
      organizationId: orgA,
      userIds: [userId],
    };

    let service: IngredientVersionsService;

    const day = (offset: number) => new Date(Date.UTC(2026, 10, 20 + offset));

    beforeAll(async () => {
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.createMany({
        data: [orgA, orgB].map((orgId) => ({
          id: orgId,
          label: orgId,
          slug: orgId,
          userId,
        })),
      });
      await db.brand.createMany({
        data: [
          { id: brandA1, organizationId: orgA },
          { id: brandA2, organizationId: orgA },
          { id: brandB1, organizationId: orgB },
        ].map((brand) => ({
          ...brand,
          label: brand.id,
          slug: brand.id,
          userId,
        })),
      });
      const base = {
        brandId: brandA1,
        category: IngredientCategory.IMAGE,
        organizationId: orgA,
        status: IngredientStatus.GENERATED,
        userId,
      };
      await db.ingredient.create({
        data: { ...base, createdAt: day(0), id: first },
      });
      await db.ingredient.createMany({
        data: [
          {
            ...base,
            createdAt: day(1),
            id: second,
            parentId: first,
            relationKind: 'VERSION',
            version: 2,
          },
          {
            ...base,
            createdAt: day(3),
            id: third,
            parentId: second,
            relationKind: 'TRANSFORMATION',
            version: 3,
          },
          {
            ...base,
            createdAt: day(4),
            id: crop,
            parentId: first,
            relationKind: 'DERIVATIVE',
          },
          { ...base, createdAt: day(2), id: legacy, parentId: first },
          { ...base, createdAt: day(5), id: loneAsset },
        ],
      });
      service = new IngredientVersionsService(db as unknown as PrismaService);
    });

    afterAll(async () => {
      if (!prisma) {
        return;
      }
      await prisma.ingredient.deleteMany({
        where: { userId, parentId: { not: null } },
      });
      await prisma.ingredient.deleteMany({ where: { userId } });
      await prisma.brand.deleteMany({ where: { userId } });
      await prisma.organization.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    const summary = (history: {
      activeVersionId: string;
      versions: { id: string; number: number; relation: string }[];
    }) => ({
      active: history.activeVersionId,
      versions: history.versions.map((v) => [v.id, v.number, v.relation]),
    });

    it('lists the same ordered history and active version from any member', async () => {
      const expected = {
        active: third,
        versions: [
          [first, 1, 'original'],
          [second, 2, 'version'],
          [third, 3, 'transformation'],
        ],
      };
      for (const start of [first, second, third]) {
        expect(summary(await service.findHistory(start, viewer))).toEqual(
          expected,
        );
      }
    });

    it('returns the media documents in history order', async () => {
      const history = await service.findHistory(second, viewer);
      expect(history.docs.map((doc) => doc.id)).toEqual([first, second, third]);
      expect(history.rootId).toBe(first);
      expect(history.isLineageAvailable).toBe(true);
    });

    it('keeps a derivative out of the history and gives it one of its own', async () => {
      expect(summary(await service.findHistory(crop, viewer))).toEqual({
        active: crop,
        versions: [[crop, 1, 'original']],
      });
    });

    it('shows a legacy link as one unavailable version instead of guessing', async () => {
      const history = await service.findHistory(legacy, viewer);
      expect(summary(history)).toEqual({
        active: legacy,
        versions: [[legacy, 1, 'unavailable']],
      });
      expect(history.isLineageAvailable).toBe(false);
    });

    it('shows an asset with no history as its own original', async () => {
      expect(summary(await service.findHistory(loneAsset, viewer))).toEqual({
        active: loneAsset,
        versions: [[loneAsset, 1, 'original']],
      });
    });

    it('restores an older version without deleting newer ones, and clears the choice on the newest', async () => {
      const restored = await service.setActive(first, second, viewer);
      expect(restored.activeVersionId).toBe(second);
      expect(restored.versions.map((v) => v.id)).toEqual([
        first,
        second,
        third,
      ]);
      expect((await service.findHistory(third, viewer)).activeVersionId).toBe(
        second,
      );

      await service.setActive(third, third, viewer);
      const stored = await database().ingredient.findUniqueOrThrow({
        select: { activeVersionId: true },
        where: { id: first },
      });
      expect(stored.activeVersionId).toBeNull();
    });

    it('rejects a version that is not part of the history', async () => {
      await expect(
        service.setActive(first, crop, viewer),
      ).rejects.toBeInstanceOf(ValidationException);
      await expect(
        service.setActive(first, legacy, viewer),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('recovers to the newest version when the active one is trashed, and keeps the versions made from it', async () => {
      await service.setActive(first, second, viewer);
      await database().ingredient.update({
        data: { isDeleted: true },
        where: { id: second },
      });
      try {
        const history = await service.findHistory(first, viewer);
        expect(history.versions.map((v) => [v.id, v.number])).toEqual([
          [first, 1],
          [third, 2],
        ]);
        expect(history.activeVersionId).toBe(third);
        expect(
          (await service.findHistory(third, viewer)).versions.map((v) => v.id),
        ).toEqual([first, third]);
      } finally {
        await database().ingredient.update({
          data: { isDeleted: false },
          where: { id: second },
        });
        await database().ingredient.update({
          data: { activeVersionId: null },
          where: { id: first },
        });
      }
    });

    it('lets the owner of the asked-for asset change the version from another selected brand', async () => {
      const restored = await service.setActive(first, second, {
        organizationId: orgA,
        userIds: [userId],
      });
      try {
        expect(restored.activeVersionId).toBe(second);
      } finally {
        await database().ingredient.update({
          data: { activeVersionId: null },
          where: { id: first },
        });
      }
    });

    it('shows a private asset and its private versions to their owner only', async () => {
      const privateRoot = id('private-root');
      const privateChild = id('private-child');
      const shared = {
        brandId: brandA1,
        category: IngredientCategory.IMAGE,
        organizationId: orgA,
        status: IngredientStatus.GENERATED,
        userId,
      };
      await database().ingredient.createMany({
        data: [
          { ...shared, createdAt: day(6), id: privateRoot, scope: 'BRAND' },
          {
            ...shared,
            createdAt: day(7),
            id: privateChild,
            parentId: privateRoot,
            relationKind: 'VERSION',
            scope: 'USER',
            version: 2,
          },
        ],
      });
      const stranger = { brandId: brandA1, organizationId: orgA, userIds: [] };

      expect(
        (await service.findHistory(privateRoot, viewer)).versions.map(
          (v) => v.id,
        ),
      ).toEqual([privateRoot, privateChild]);
      expect(
        (await service.findHistory(privateRoot, stranger)).versions.map(
          (v) => v.id,
        ),
      ).toEqual([privateRoot]);
      await expect(
        service.findHistory(privateChild, stranger),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves the first and newest asset of a chain longer than the display limit', async () => {
      const chain = Array.from({ length: 52 }, (_, index) =>
        id(`chain-${index + 1}`),
      );
      await database().ingredient.createMany({
        data: chain.map((chainId, index) => ({
          brandId: brandA1,
          category: IngredientCategory.IMAGE,
          createdAt: day(10 + index),
          id: chainId,
          organizationId: orgA,
          parentId: index === 0 ? null : chain[index - 1],
          relationKind: index === 0 ? null : ('VERSION' as const),
          scope: 'BRAND' as const,
          status: IngredientStatus.GENERATED,
          userId,
          version: index + 1,
        })),
      });

      for (const start of [chain[0], chain[25], chain[51]]) {
        const history = await service.findHistory(start, viewer);
        expect(history.rootId).toBe(chain[0]);
        expect(history.activeVersionId).toBe(chain[51]);
        expect(history.versions).toHaveLength(50);
        expect(history.versions[0].number).toBe(3);
      }

      const restored = await service.setActive(chain[51], chain[0], viewer);
      expect(restored.activeVersionId).toBe(chain[0]);
      expect(restored.versions).toHaveLength(51);
      expect(restored.versions[0].id).toBe(chain[0]);
    });

    it('hides an asset from another organization and from another brand', async () => {
      await expect(
        service.findHistory(first, { brandId: brandB1, organizationId: orgB }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.findHistory(first, { brandId: brandA2, organizationId: orgA }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.setActive(first, second, {
          brandId: brandB1,
          organizationId: orgB,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);
