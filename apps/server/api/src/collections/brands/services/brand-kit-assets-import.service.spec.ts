import { generateKeyPairSync } from 'node:crypto';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs1' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
});

const AVATAR = 'https://cdn.genfeed.ai/ingredients/social-avatars/cred-1';
const TENANT_IMAGE = 'https://cdn.genfeed.ai/ingredients/images/other-org.jpg';

describe('BrandKitAssetsService.importBrandKitAssets CDN fetch', () => {
  let assetCreate: ReturnType<typeof vi.fn>;
  let uploadToS3: ReturnType<typeof vi.fn>;
  let service: BrandKitAssetsService;

  function createService(isDeliveryEnabled: boolean): BrandKitAssetsService {
    return new BrandKitAssetsService(
      {
        asset: {
          create: assetCreate,
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      } as unknown as PrismaService,
      {
        invalidate: vi.fn(),
        invalidateByTags: vi.fn(),
      } as unknown as CacheInvalidationService,
      { uploadToS3 } as unknown as FilesClientService,
      {
        isAuthorizedMediaDeliveryEnabled: isDeliveryEnabled,
        mediaUrlConfig: {
          cdnUrl: 'https://cdn.genfeed.ai',
          signing: { keyPairId: 'KEYPAIR', privateKey, ttlSeconds: 900 },
        },
      } as unknown as ConfigService,
    );
  }

  async function importCandidate(url: string) {
    return service.importBrandKitAssets(
      'brand-1',
      'org-1',
      'user-1',
      {
        assets: [
          {
            candidateId: 'c1',
            label: 'profile image',
            mimeType: 'image/jpeg',
            role: 'logo',
            url,
          },
        ],
      } as never,
      async () => ({ id: 'brand-1' }) as never,
    );
  }

  beforeEach(() => {
    assetCreate = vi.fn().mockResolvedValue({ id: 'asset-1' });
    uploadToS3 = vi.fn().mockResolvedValue({ size: 1024 });
    service = createService(true);
  });

  it('downloads a mirrored social avatar with a signed URL but keeps the plain URL as origin', async () => {
    await importCandidate(AVATAR);

    const fetched = new URL(uploadToS3.mock.calls[0][2].url);
    expect(`${fetched.origin}${fetched.pathname}`).toBe(AVATAR);
    expect(fetched.searchParams.get('Signature')).toBeTruthy();
    expect(assetCreate.mock.calls[0][0].data.origin).toBe(AVATAR);
  });

  it('never signs other CDN paths for a caller-supplied URL', async () => {
    await importCandidate(TENANT_IMAGE);

    expect(uploadToS3.mock.calls[0][2].url).toBe(TENANT_IMAGE);
  });

  it('leaves the URL alone when authorized delivery is off', async () => {
    service = createService(false);
    await importCandidate(AVATAR);

    expect(uploadToS3.mock.calls[0][2].url).toBe(AVATAR);
  });
});
