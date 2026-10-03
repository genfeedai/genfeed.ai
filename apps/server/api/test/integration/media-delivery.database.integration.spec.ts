import { generateKeyPairSync } from 'node:crypto';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { mediaSourceIdentity } from '@api/services/media-urls/media-delivery-policy.util';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PRISMA_MODEL_METADATA, PrismaClient } from '@genfeedai/prisma';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import { tenantModelsFromMetadata } from '@libs/prisma/discover-tenant-models';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { createTenantGuardExtension } from '@libs/prisma/tenant-guard.extension';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

// Explicit opt-in only: never fall back to a shared or production DATABASE_URL.
const databaseUrl = process.env.MEDIA_DELIVERY_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.pathname !== '/media_delivery_4895_test' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'Media integration requires its dedicated loopback test database',
    );
  }
}

const ownerId = testId('media-db-owner');
const freeOrg = testId('media-db-org', 1);
const paidOrg = testId('media-db-org', 2);
const freeImage = testId('media-db-image', 1);
const paidImage = testId('media-db-image', 2);
const deletedImage = testId('media-db-image', 3);
const sourceKey = ' ingredients/images/opaque%2F?#token.png ';
const freeScope = { organizationId: freeOrg, userId: ownerId };

function guardedClient(db: PrismaClient) {
  return db.$extends(
    createTenantGuardExtension({
      isCloud: true,
      tenantModelNames: new Set(
        tenantModelsFromMetadata(PRISMA_MODEL_METADATA).map(
          ({ model }) => model,
        ),
      ),
    }),
  );
}

describe.skipIf(!databaseUrl)(
  'media issuer with migrated PostgreSQL and production tenant guard',
  () => {
    let db: PrismaClient;
    let guarded: ReturnType<typeof guardedClient>;
    let issuer: AuthorizedMediaUrlService;
    let urls: MediaUrlService;

    beforeAll(async () => {
      db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }),
      });
      await db.$connect();
      await db.user.create({
        data: { id: ownerId, handle: 'media-db-owner-4895' },
      });
      for (const [id, subscriptionTier] of [
        [freeOrg, 'free'],
        [paidOrg, 'pro'],
      ] as const) {
        await db.organization.create({
          data: {
            id,
            userId: ownerId,
            label: 'Media integration',
            slug: `media-4895-${subscriptionTier}`,
          },
        });
        await db.organizationSetting.create({
          data: { organizationId: id, subscriptionTier },
        });
      }
      await db.ingredient.createMany({
        data: [
          {
            id: freeImage,
            organizationId: freeOrg,
            userId: ownerId,
            s3Key: sourceKey,
            category: 'IMAGE',
            mimeType: 'image/png',
          },
          {
            id: paidImage,
            organizationId: paidOrg,
            userId: ownerId,
            s3Key: sourceKey,
            category: 'IMAGE',
            mimeType: 'image/png',
          },
          {
            id: deletedImage,
            organizationId: freeOrg,
            userId: ownerId,
            s3Key: sourceKey,
            isDeleted: true,
          },
        ],
      });
      guarded = guardedClient(db);
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const config = {
        isAuthorizedMediaDeliveryEnabled: true,
        isCdnSigningEnabled: true,
        mediaUrlConfig: {
          cdnUrl: 'https://media.test',
          isAuthorizationRequired: true,
          signing: {
            keyPairId: 'MEDIA-TEST',
            privateKey: privateKey
              .export({ type: 'pkcs8', format: 'pem' })
              .toString(),
            ttlSeconds: 30,
          },
        },
      } as unknown as ConfigService;
      urls = new MediaUrlService(config);
      vi.spyOn(urls, 'buildUrl');
      issuer = new AuthorizedMediaUrlService(
        guarded as unknown as PrismaService,
        config,
        urls,
      );
    });
    beforeEach(() => vi.clearAllMocks());
    afterAll(async () => {
      if (!db) return;
      try {
        await db.mediaDeliveryVariant.deleteMany({
          where: { organizationId: { in: [freeOrg, paidOrg] } },
        });
        await db.ingredient.deleteMany({
          where: { id: { in: [freeImage, paidImage, deletedImage] } },
        });
        await db.organizationSetting.deleteMany({
          where: { organizationId: { in: [freeOrg, paidOrg] } },
        });
        await db.organization.deleteMany({
          where: { id: { in: [freeOrg, paidOrg] } },
        });
        await db.user.deleteMany({ where: { id: ownerId } });
      } finally {
        await db.$disconnect();
      }
    });

    it('denies free originals and foreign/deleted records through actual scoped database reads', async () => {
      await runWithTenantContext({ organizationId: freeOrg }, async () => {
        await expect(
          issuer.issueOriginal(freeScope, freeImage),
        ).rejects.toThrow('paid plan');
        await expect(
          issuer.issueOriginal(freeScope, paidImage),
        ).rejects.toThrow('unavailable');
        await expect(
          issuer.issueOriginal(freeScope, deletedImage),
        ).rejects.toThrow('unavailable');
        const [projection] = await issuer.projectIngredients(freeScope, [
          freeImage,
        ]);
        expect(projection.grant).toMatchObject({ state: 'PENDING', url: null });
      });
      expect(urls.buildUrl).not.toHaveBeenCalled();
    });

    it('issues a fresh paid grant for the exact raw key with a bounded expiry', async () => {
      const started = Date.now();
      const grant = await runWithTenantContext(
        { organizationId: paidOrg },
        () =>
          issuer.issueOriginal(
            { organizationId: paidOrg, userId: ownerId },
            paidImage,
          ),
      );
      const url = new URL(grant.url as string);
      expect(url.pathname).toBe(
        '/%20ingredients/images/opaque%252F%3F%23token.png%20',
      );
      expect(
        Number(url.searchParams.get('Expires')) * 1000,
      ).toBeGreaterThanOrEqual(started + 29_000);
      expect(
        Number(url.searchParams.get('Expires')) * 1000,
      ).toBeLessThanOrEqual(Date.now() + 31_000);
    });

    it('enforces variant uniqueness and SQL state/purpose constraints', async () => {
      const source = await db.ingredient.findUniqueOrThrow({
        where: { id: freeImage },
      });
      const data = {
        organizationId: freeOrg,
        ingredientId: freeImage,
        sourceIdentity: mediaSourceIdentity(source),
        sourceKey,
        sourceVersion: source.version,
        policyVersion: 1,
        purpose: 'preview',
        state: 'READY',
        storageKey: 'exports/watermarked/media-db-preview.png',
      };
      await db.mediaDeliveryVariant.create({ data });
      await expect(db.mediaDeliveryVariant.create({ data })).rejects.toThrow();
      await expect(
        db.mediaDeliveryVariant.create({
          data: { ...data, sourceIdentity: 'invalid-state', state: 'BROKEN' },
        }),
      ).rejects.toThrow();
      await expect(
        db.mediaDeliveryVariant.create({
          data: {
            ...data,
            sourceIdentity: 'invalid-purpose',
            purpose: 'original-download',
          },
        }),
      ).rejects.toThrow();
    });

    it('guards new variant reads and rejects stale source derivatives without an original fallback', async () => {
      await runWithTenantContext({ organizationId: freeOrg }, async () => {
        await expect(
          guarded.mediaDeliveryVariant.findMany({
            where: { ingredientId: freeImage, isDeleted: false },
          }),
        ).rejects.toThrow();
        const [ready] = await issuer.projectIngredients(freeScope, [freeImage]);
        expect(ready.grant.state).toBe('READY');
        expect(new URL(ready.grant.url as string).pathname).toBe(
          '/exports/watermarked/media-db-preview.png',
        );
        await db.ingredient.update({
          where: { id: freeImage },
          data: { version: { increment: 1 } },
        });
        const [changed] = await issuer.projectIngredients(freeScope, [
          freeImage,
        ]);
        expect(changed.grant).toMatchObject({ state: 'PENDING', url: null });
      });
    });
  },
);
