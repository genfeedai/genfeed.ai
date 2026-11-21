import { randomUUID } from 'node:crypto';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { VideoRetentionService } from '@api/services/video-retention/video-retention.service';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  SubscriptionStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaService } from '@libs/prisma/prisma.service';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-21T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

/**
 * Real Postgres: proves the retention filters (relation `none` filters, the
 * `postedTo` array filter, per-organization windows) select exactly the
 * never-posted videos past their window, and that a failed delete leaves the
 * row unstamped so the next run retries it.
 */
describe.skipIf(!connectionString)(
  'VideoRetentionService PostgreSQL end-to-end',
  () => {
    const db = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!db)
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      return db;
    };

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const deletedKeys: string[] = [];
    const files = { deleteStoredObject: vi.fn() };

    let sweepPrisma: PrismaService;
    let suffix: string;
    let userId: string;
    let paygOrgId: string;
    let subscriberOrgId: string;
    let paygBrandId: string;
    let service: VideoRetentionService;

    beforeAll(() => {
      sweepPrisma = new PrismaService({
        get: (key: string) =>
          ({ DATABASE_URL: connectionString, GENFEED_CLOUD: '1' })[
            key as 'DATABASE_URL' | 'GENFEED_CLOUD'
          ],
        mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
      } as never);
      service = new VideoRetentionService(
        sweepPrisma,
        files as never,
        new OrganizationPaidAccessService(
          sweepPrisma as never,
          logger as never,
        ),
        logger as never,
      );
    });

    const video = (
      name: string,
      org: string,
      ageDays: number,
      extra: Record<string, unknown> = {},
    ) =>
      database().ingredient.create({
        data: {
          category: IngredientCategory.VIDEO,
          createdAt: daysAgo(ageDays),
          id: `vr-${name}-${suffix}`,
          organizationId: org,
          origin: IngredientOrigin.GENERATED,
          s3Key: `ingredients/videos/vr-${name}-${suffix}`,
          status: IngredientStatus.GENERATED,
          userId,
          ...extra,
        },
      });

    const post = (
      name: string,
      state: TargetExecutionState,
      ingredientId: string,
      via: 'entity' | 'link',
    ) =>
      database().post.create({
        data: {
          brandId: paygBrandId,
          description: name,
          id: `vr-post-${name}-${suffix}`,
          organizationId: paygOrgId,
          targetExecutionState: state,
          userId,
          ...(via === 'entity'
            ? { entityIngredientId: ingredientId }
            : {
                ingredientLinks: {
                  create: {
                    ingredientId,
                    organizationId: paygOrgId,
                    position: 0,
                  },
                },
              }),
        },
      });

    const expiredAt = async (name: string) =>
      (
        await database().ingredient.findUniqueOrThrow({
          select: { storageExpiredAt: true },
          where: { id: `vr-${name}-${suffix}` },
        })
      ).storageExpiredAt;

    beforeEach(async () => {
      // The unit config unstubs env between tests.
      vi.stubEnv('GENFEED_CLOUD', '1');
      suffix = randomUUID();
      deletedKeys.length = 0;
      // The unit config resets mock implementations between tests.
      files.deleteStoredObject
        .mockReset()
        .mockImplementation(async (key: string) => {
          deletedKeys.push(key);
        });
      userId = `vr-user-${suffix}`;
      paygOrgId = `vr-org-payg-${suffix}`;
      subscriberOrgId = `vr-org-sub-${suffix}`;
      paygBrandId = `vr-brand-${suffix}`;

      await database().user.create({ data: { handle: userId, id: userId } });
      for (const id of [paygOrgId, subscriberOrgId]) {
        await database().organization.create({
          data: { id, label: id, slug: id, userId },
        });
      }
      await database().brand.create({
        data: {
          id: paygBrandId,
          label: 'b',
          organizationId: paygOrgId,
          slug: paygBrandId,
        },
      });
      await database().subscription.create({
        data: {
          currentPeriodEnd: new Date(NOW.getTime() + 20 * DAY),
          organizationId: subscriberOrgId,
          plan: 'monthly',
          status: SubscriptionStatus.ACTIVE,
          userId,
        },
      });
    });

    afterEach(async () => {
      const orgs = { in: [paygOrgId, subscriberOrgId] };
      await database().postIngredient.deleteMany({
        where: { organizationId: orgs },
      });
      await database().post.deleteMany({ where: { organizationId: orgs } });
      await database().ingredient.deleteMany({
        where: { organizationId: orgs },
      });
      await database().subscription.deleteMany({
        where: { organizationId: orgs },
      });
      await database().brand.deleteMany({ where: { organizationId: orgs } });
      await database().organization.deleteMany({ where: { id: orgs } });
      await database().user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await db?.$disconnect();
      await sweepPrisma?.$disconnect();
    });

    it('expires an unposted pay-as-you-go video after 7 days and keeps a newer one', async () => {
      await video('old', paygOrgId, 8);
      await video('fresh', paygOrgId, 6);

      const totals = await service.sweep(NOW);

      expect(deletedKeys).toEqual([`ingredients/videos/vr-old-${suffix}`]);
      expect(await expiredAt('old')).toEqual(NOW);
      expect(await expiredAt('fresh')).toBeNull();
      expect(totals).toMatchObject({ deleted: 1, failed: 0 });
    });

    it('keeps a subscriber video for 30 days', async () => {
      await video('sub-8', subscriberOrgId, 8);
      await video('sub-29', subscriberOrgId, 29);
      await video('sub-31', subscriberOrgId, 31);

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([`ingredients/videos/vr-sub-31-${suffix}`]);
      expect(await expiredAt('sub-8')).toBeNull();
      expect(await expiredAt('sub-29')).toBeNull();
    });

    it('shortens the window when a subscriber downgrades', async () => {
      await video('sub-10', subscriberOrgId, 10);
      await database().subscription.deleteMany({
        where: { organizationId: subscriberOrgId },
      });

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([`ingredients/videos/vr-sub-10-${suffix}`]);
    });

    it.each([
      [
        'published through entityIngredientId',
        TargetExecutionState.PUBLISHED,
        'entity',
      ],
      [
        'published through the ingredient join',
        TargetExecutionState.PUBLISHED,
        'link',
      ],
      ['scheduled', TargetExecutionState.SCHEDULED, 'entity'],
      ['publishing', TargetExecutionState.PUBLISHING, 'link'],
      ['failed and retryable', TargetExecutionState.FAILED, 'entity'],
    ] as const)('keeps a video that is %s', async (_label, state, via) => {
      const row = await video('kept', paygOrgId, 40);
      await post('kept', state, row.id, via);

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([]);
      expect(await expiredAt('kept')).toBeNull();
    });

    it('keeps a video recorded as posted to a platform', async () => {
      await video('posted', paygOrgId, 40, { postedTo: ['instagram'] });

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([]);
    });

    it.each([
      TargetExecutionState.DRAFT,
      TargetExecutionState.CANCELLED,
      TargetExecutionState.SKIPPED,
    ])('expires a video whose only post is %s', async (state) => {
      const row = await video('draft', paygOrgId, 40);
      await post('draft', state, row.id, 'entity');

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([`ingredients/videos/vr-draft-${suffix}`]);
    });

    it('ignores a deleted post when deciding whether a video was posted', async () => {
      const row = await video('gone', paygOrgId, 40);
      const removed = await post(
        'gone',
        TargetExecutionState.PUBLISHED,
        row.id,
        'entity',
      );
      await database().post.update({
        data: { isDeleted: true },
        where: { id: removed.id },
      });

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([`ingredients/videos/vr-gone-${suffix}`]);
    });

    it('leaves images, deleted rows and already-expired videos alone', async () => {
      await video('image', paygOrgId, 40, {
        category: IngredientCategory.IMAGE,
      });
      await video('deleted', paygOrgId, 40, { isDeleted: true });
      await video('done', paygOrgId, 40, { storageExpiredAt: daysAgo(3) });

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([]);
    });

    it('derives the canonical key for a legacy row without one', async () => {
      await video('legacy', paygOrgId, 40, { s3Key: null });

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([`ingredients/videos/vr-legacy-${suffix}`]);
    });

    it('never deletes a key outside ingredients/videos/', async () => {
      await video('odd', paygOrgId, 40, { s3Key: 'ingredients/images/shared' });

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([`ingredients/videos/vr-odd-${suffix}`]);
    });

    it('leaves the row unstamped when the delete fails, so the next run retries', async () => {
      await video('flaky', paygOrgId, 40);
      files.deleteStoredObject.mockRejectedValueOnce(
        new Error('files service down'),
      );

      const first = await service.sweep(NOW);
      expect(first).toMatchObject({ deleted: 0, failed: 1 });
      expect(await expiredAt('flaky')).toBeNull();

      const second = await service.sweep(NOW);
      expect(second).toMatchObject({ deleted: 1, failed: 0 });
      expect(await expiredAt('flaky')).toEqual(NOW);
    });

    it.each([
      ['uploaded', IngredientOrigin.UPLOADED],
      ['imported', IngredientOrigin.IMPORTED],
      ['of unknown origin', IngredientOrigin.UNKNOWN],
    ])('keeps a video that is %s, however old', async (_label, origin) => {
      await video('theirs', paygOrgId, 400, {
        origin,
        status: IngredientStatus.UPLOADED,
      });

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([]);
      expect(await expiredAt('theirs')).toBeNull();
    });

    it('lets a video that keeps failing hold back neither the cap nor the videos after it', async () => {
      await video('a-stuck', paygOrgId, 40);
      await video('b-fine', paygOrgId, 40);
      files.deleteStoredObject.mockImplementation(async (key: string) => {
        if (key.includes('vr-a-stuck')) throw new Error('object locked');
        deletedKeys.push(key);
      });

      const totals = await service.sweep(NOW);

      expect(totals).toMatchObject({ deleted: 1, failed: 1 });
      expect(deletedKeys).toEqual([`ingredients/videos/vr-b-fine-${suffix}`]);
      expect(await expiredAt('a-stuck')).toBeNull();
      expect(await expiredAt('b-fine')).toEqual(NOW);
    });

    it('does not delete a video that was posted after the batch was listed', async () => {
      await video('late', paygOrgId, 40);
      // The post lands after the batch was listed and before the claim: the
      // claim repeats every keep rule, so it has to see the post.
      const ingredient = sweepPrisma.ingredient as unknown as {
        updateMany: (args: unknown) => Promise<unknown>;
      };
      const claim = ingredient.updateMany.bind(ingredient);
      let posted = false;
      ingredient.updateMany = async (args: unknown) => {
        if (!posted) {
          posted = true;
          await post(
            'late',
            TargetExecutionState.SCHEDULED,
            `vr-late-${suffix}`,
            'entity',
          );
        }
        return claim(args);
      };

      let totals: Awaited<ReturnType<typeof service.sweep>>;
      try {
        totals = await service.sweep(NOW);
      } finally {
        ingredient.updateMany = claim;
      }

      expect(deletedKeys).toEqual([]);
      expect(totals).toMatchObject({ deleted: 0, failed: 0 });
      expect(await expiredAt('late')).toBeNull();
    });

    it('keeps every file on a deployment without organization billing', async () => {
      vi.stubEnv('GENFEED_CLOUD', '0');
      await video('selfhost', paygOrgId, 40);

      await service.sweep(NOW);

      expect(deletedKeys).toEqual([]);
    });
  },
);
