vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ClipProjectClientSourceService } from '@api/collections/clip-projects/services/clip-project-client-source.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';

// A real pair of tenant records: authorization is decided by the service's
// query rather than a permission mock that accepts every requested key.
const videos = [
  {
    organizationId: 'org-a',
    s3Key: 'ingredients/videos/owned',
    isDeleted: false,
  },
  {
    organizationId: 'org-b',
    s3Key: 'ingredients/videos/foreign',
    isDeleted: false,
  },
  {
    organizationId: 'org-a',
    s3Key: 'ingredients/videos/deleted',
    isDeleted: true,
  },
];

describe('ClipProjectClientSourceService', () => {
  const ingredient = { findFirst: vi.fn() };
  const service = new ClipProjectClientSourceService(
    { ingredient } as unknown as PrismaService,
    { cdnUrl: 'https://cdn.example.com' } as ConfigService,
  );
  beforeEach(() => {
    ingredient.findFirst.mockReset().mockImplementation(({ where }) => {
      const row = videos.find(
        (video) =>
          video.organizationId === where.organizationId &&
          video.isDeleted === where.isDeleted &&
          video.s3Key === where.s3Key,
      );
      return Promise.resolve(row ? { s3Key: row.s3Key, metadata: null } : null);
    });
  });

  it.each(['foreign', 'deleted'])(
    'refuses a %s key and its CDN URL',
    async (name) => {
      for (const input of [
        { sourceVideoS3Key: `ingredients/videos/${name}` },
        {
          sourceVideoUrl: `https://cdn.example.com/ingredients/videos/${name}`,
        },
      ]) {
        await expect(service.resolve(input, 'org-a')).rejects.toThrow(
          /owned Library video/,
        );
      }
    },
  );

  it('accepts an owned URL including encoded paths and an expiring CDN signature', async () => {
    await expect(
      service.resolve(
        {
          sourceVideoUrl:
            'https://cdn.example.com/ingredients/videos/%6Fwned?Signature=expired',
        },
        'org-a',
        'brand-a',
      ),
    ).resolves.toEqual({
      sourceVideoS3Key: 'ingredients/videos/owned',
      sourceVideoUrl: 'https://cdn.example.com/ingredients/videos/owned',
    });
    expect(ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ brandId: 'brand-a' }, { brandId: null }],
        }),
      }),
    );
  });

  it.each([
    'https://cdn.example.com/ingredients/videos/foreign',
    'https://cdn.example.com.attacker.test/ingredients/videos/owned',
    'https://provider.example.com/foreign.mp4',
  ])(
    'refuses an owned key paired with a different source URL: %s',
    async (sourceVideoUrl) => {
      await expect(
        service.resolve(
          { sourceVideoS3Key: 'ingredients/videos/owned', sourceVideoUrl },
          'org-a',
        ),
      ).rejects.toThrow(/owned Library video/);
    },
  );

  it('accepts record-bound keyless external media and keeps its exact query', async () => {
    const url = 'https://provider.example.com/own.mp4?token=public-media-token';
    ingredient.findFirst.mockResolvedValueOnce({
      s3Key: null,
      metadata: { result: url },
    });
    await expect(
      service.resolve({ sourceVideoUrl: url }, 'org-a'),
    ).resolves.toEqual({ sourceVideoS3Key: undefined, sourceVideoUrl: url });
    expect(ingredient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          isDeleted: false,
          metadata: { is: { isDeleted: false, result: url } },
        }),
      }),
    );
  });

  it.each(['../foreign', '/absolute', 'ingredients/videos/%2e%2e/foreign'])(
    'rejects unsafe key %s before lookup',
    async (sourceVideoS3Key) => {
      await expect(
        service.resolve({ sourceVideoS3Key }, 'org-a'),
      ).rejects.toThrow();
      expect(ingredient.findFirst).not.toHaveBeenCalled();
    },
  );
});
