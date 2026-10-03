import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { mediaSourceIdentity } from '@api/services/media-urls/media-delivery-policy.util';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import type { MediaDeliverySource } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { Test } from '@nestjs/testing';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: vi.fn(() => true),
}));

const organizationId = testId('org', 1);
const userId = testId('user', 1);
const ingredientId = testId('ingredient', 1);
const scope = { organizationId, userId };
const source: MediaDeliverySource = {
  brandId: null,
  category: 'IMAGE',
  fileSize: 100,
  generationCompletedAt: null,
  id: ingredientId,
  isPublic: false,
  metadataId: testId('metadata', 1),
  mimeType: 'image/png',
  organizationId,
  s3Key: 'ingredients/images/a?b#c%2F.png',
  scope: 'USER',
  userId,
  version: 1,
};

async function setup(tier = 'free') {
  const prisma = {
    asset: { findMany: vi.fn().mockResolvedValue([]) },
    post: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ingredient: { findMany: vi.fn().mockResolvedValue([source]) },
    personaGrant: { findMany: vi.fn().mockResolvedValue([]) },
    mediaDeliveryVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    organization: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ settings: { subscriptionTier: tier } }),
    },
  };
  const config = {
    isAuthorizedMediaDeliveryEnabled: true,
    isCdnSigningEnabled: true,
    mediaUrlConfig: { signing: { ttlSeconds: 900 } },
  };
  const urls = {
    buildUrl: vi.fn(
      (key: string) =>
        `https://media.example/${encodeURIComponent(key)}?signed=1`,
    ),
  };
  const module = await Test.createTestingModule({
    providers: [
      AuthorizedMediaUrlService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: config },
      { provide: MediaUrlService, useValue: urls },
    ],
  }).compile();
  return {
    service: module.get(AuthorizedMediaUrlService),
    prisma,
    urls,
    config,
  };
}

describe('AuthorizedMediaUrlService', () => {
  it('projects paid assets only from canonical organization-bound stored keys', async () => {
    const { service, prisma, urls } = await setup('pro');
    prisma.asset.findMany.mockResolvedValue([
      {
        id: 'asset-1',
        cloudObjectKey: 'assets/images/ space ?#%2F.png ',
        parentBrandId: null,
        userId,
      },
    ] as never);
    const result = await service.projectAssets(scope, ['asset-1']);
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['asset-1'] },
          parentOrgId: organizationId,
          isDeleted: false,
        },
      }),
    );
    expect(urls.buildUrl).toHaveBeenCalledWith(
      'assets/images/ space ?#%2F.png ',
    );
    expect(result[0].url).toContain('signed=1');
  });
  it('does not turn arbitrary asset provider URLs into grants', async () => {
    const { service, prisma, urls } = await setup('pro');
    prisma.asset.findMany.mockResolvedValue([
      {
        id: 'asset-1',
        cloudObjectKey: 'https://provider.test/original',
        parentBrandId: null,
        userId,
      },
    ] as never);
    expect(await service.projectAssets(scope, ['asset-1'])).toEqual([
      { assetId: 'asset-1', url: null },
    ]);
    expect(urls.buildUrl).not.toHaveBeenCalled();
  });
  it('keeps non-entitled asset originals unavailable without reading or signing their keys', async () => {
    const { service, prisma, urls } = await setup();
    expect(await service.projectAssets(scope, ['asset-1'])).toEqual([
      { assetId: 'asset-1', url: null },
    ]);
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
    expect(urls.buildUrl).not.toHaveBeenCalled();
  });

  beforeEach(() => vi.mocked(isCloudDeployment).mockReturnValue(true));

  it('denies free original grants without asking the signer', async () => {
    const { service, urls } = await setup();
    await expect(service.issueOriginal(scope, ingredientId)).rejects.toThrow(
      'paid plan',
    );
    expect(urls.buildUrl).not.toHaveBeenCalled();
  });

  it('mints paid original grants from the exact stored key using existing TTL', async () => {
    const { service, prisma, urls } = await setup('pro');
    const start = Date.now();
    const grant = await service.issueOriginal(scope, ingredientId);
    expect(urls.buildUrl).toHaveBeenCalledWith(source.s3Key);
    expect(Date.parse(grant.expiresAt as string)).toBeGreaterThanOrEqual(
      start + 900_000,
    );
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [ingredientId] }, isDeleted: false, organizationId },
      }),
    );
  });

  it('rejects foreign, deleted/missing and private-user records before signing', async () => {
    for (const record of [
      undefined,
      { ...source, organizationId: testId('org', 2) },
      { ...source, userId: testId('user', 2) },
    ]) {
      const { service, prisma, urls } = await setup('pro');
      prisma.ingredient.findMany.mockResolvedValue(record ? [record] : []);
      await expect(service.issueOriginal(scope, ingredientId)).rejects.toThrow(
        'unavailable',
      );
      expect(urls.buildUrl).not.toHaveBeenCalled();
    }
  });

  it('returns pending previews and never falls back to the original', async () => {
    const { service, urls } = await setup();
    expect(
      (await service.projectIngredients(scope, [ingredientId]))[0].grant,
    ).toMatchObject({ state: 'PENDING', url: null });
    expect(urls.buildUrl).not.toHaveBeenCalled();
  });

  it('uses only a ready derivative with the current source identity', async () => {
    const { service, prisma, urls } = await setup();
    prisma.mediaDeliveryVariant.findMany.mockResolvedValue([
      {
        ingredientId,
        sourceIdentity: 'stale',
        state: 'READY',
        storageKey: 'exports/watermarked/stale.png',
      },
      {
        ingredientId,
        sourceIdentity: mediaSourceIdentity(source),
        state: 'READY',
        storageKey: 'exports/watermarked/preview.png',
      },
    ]);
    const [projection] = await service.projectIngredients(scope, [
      ingredientId,
    ]);
    expect(projection.grant.state).toBe('READY');
    expect(urls.buildUrl).toHaveBeenCalledWith(
      'exports/watermarked/preview.png',
    );
  });

  it('makes unsupported formats unavailable and signer failure has no unsigned fallback', async () => {
    const { service, prisma, config, urls } = await setup();
    prisma.ingredient.findMany.mockResolvedValue([
      { ...source, category: 'VOICE' },
    ]);
    expect(
      (await service.projectIngredients(scope, [ingredientId]))[0].grant.state,
    ).toBe('UNSUPPORTED');
    config.isCdnSigningEnabled = false;
    prisma.organization.findFirst.mockResolvedValue({
      settings: { subscriptionTier: 'pro' },
    });
    await expect(service.issueOriginal(scope, ingredientId)).rejects.toThrow(
      'signing is unavailable',
    );
    expect(urls.buildUrl).not.toHaveBeenCalled();
  });

  it('publishes originals internally without granting free browser access', async () => {
    const { service } = await setup();
    const urls = await service.issueServerPublish(organizationId, [
      ingredientId,
    ]);
    expect(urls.get(ingredientId)).toContain('signed=1');
    await expect(service.issueOriginal(scope, ingredientId)).rejects.toThrow(
      'paid plan',
    );
  });

  it('preserves self-hosted unrestricted access and requires consent for public bytes', async () => {
    const { service } = await setup();
    vi.mocked(isCloudDeployment).mockReturnValue(false);
    expect((await service.issueOriginal(scope, ingredientId)).state).toBe(
      'READY',
    );
    await expect(
      service.issuePublicDerivative(scope, ingredientId, 'public-share'),
    ).rejects.toThrow('permission');
  });

  describe('granted character media (#6037)', () => {
    const recipientScope = {
      brandId: testId('brand', 2),
      organizationId: testId('org', 2),
      userId: testId('user', 2),
    };
    const ownerOrganizationId = organizationId;
    const grantRow = (overrides: Record<string, unknown> = {}) => ({
      availabilityMode: 'ALL_BRANDS',
      availableBrandIds: [],
      ownerOrganizationId,
      persona: { avatarIngredientId: ingredientId },
      ...overrides,
    });

    it('serves a granted sheet from the owning organization to the receiving brand', async () => {
      const { service, prisma } = await setup();
      prisma.personaGrant.findMany.mockResolvedValue([grantRow()]);

      const result = await service.projectGrantedCharacterMedia(
        recipientScope,
        [ingredientId],
      );

      expect(prisma.personaGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipientOrganizationId: recipientScope.organizationId,
            revokedAt: null,
          }),
        }),
      );
      expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: ownerOrganizationId,
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].url).toContain('signed=1');
    });

    it('serves nothing after revocation, outside the granted brands, or without a brand', async () => {
      const { service, prisma } = await setup();

      prisma.personaGrant.findMany.mockResolvedValue([]);
      await expect(
        service.projectGrantedCharacterMedia(recipientScope, [ingredientId]),
      ).resolves.toEqual([]);

      prisma.personaGrant.findMany.mockResolvedValue([
        grantRow({
          availabilityMode: 'SELECTED_BRANDS',
          availableBrandIds: [testId('brand', 9)],
        }),
      ]);
      await expect(
        service.projectGrantedCharacterMedia(recipientScope, [ingredientId]),
      ).resolves.toEqual([]);
      await expect(
        service.projectGrantedCharacterMedia(
          { organizationId: recipientScope.organizationId, userId },
          [ingredientId],
        ),
      ).resolves.toEqual([]);
      expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
    });
  });
});
