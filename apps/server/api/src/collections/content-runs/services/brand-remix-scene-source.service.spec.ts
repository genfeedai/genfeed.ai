import { describe, expect, it, vi } from 'vitest';
import type { BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { BrandRemixSourceResolverService } from './brand-remix-source-resolver.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { BrandRemixSceneSourceService } from './brand-remix-scene-source.service';
vi.mock('@api/index', () => ({
  scopedWhere: (organizationId: string, value: object) => ({
    ...value,
    organizationId,
    isDeleted: false,
  }),
}));
function setup() {
  const findFirst = vi.fn().mockResolvedValue({
    id: 'video',
    updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    s3Key: 'ingredients/videos/video.mp4',
    sourceActionId: null,
  });
  const source = {
    resolveSource: vi.fn().mockResolvedValue({
      sourceMedia: { importPolicy: 'embed_only', existingAssetIds: [] },
    }),
  };
  const probeMediaFromUrl = vi
    .fn()
    .mockResolvedValue({ durationSeconds: 10, sizeBytes: 1_000 });
  const buildUrl = vi.fn().mockReturnValue('https://cdn.test/owned-video');
  const service = new BrandRemixSceneSourceService(
    source as unknown as BrandRemixSourceResolverService,
    { ingredient: { findFirst } } as unknown as PrismaService,
    { buildUrl } as unknown as MediaUrlService,
    { probeMediaFromUrl } as unknown as FilesClientService,
  );
  return { service, findFirst, source, probeMediaFromUrl };
}
describe('authorized scene analysis source', () => {
  it('requires organization, brand, USER video and ready state in the query', async () => {
    const { service, findFirst } = setup();
    await service.libraryAsset('org', 'brand', 'video');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          brandId: 'brand',
          isDeleted: false,
          category: 'VIDEO',
          scope: 'USER',
          status: { in: ['UPLOADED', 'GENERATED', 'VALIDATED'] },
        }),
      }),
    );
  });
  it('rejects foreign/deleted/unavailable and copied-source assets before probing', async () => {
    const { service, findFirst, probeMediaFromUrl } = setup();
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'copied',
      sourceActionId: 'remix-source:external',
    });
    await expect(
      service.libraryAsset('org', 'brand', 'foreign'),
    ).rejects.toThrow();
    await expect(
      service.libraryAsset('org', 'brand', 'copied'),
    ).rejects.toThrow();
    expect(probeMediaFromUrl).not.toHaveBeenCalled();
  });
  it('rejects invalid or out-of-bounds source probes', async () => {
    const { service, probeMediaFromUrl } = setup();
    for (const probe of [
      { durationSeconds: null, sizeBytes: 100 },
      { durationSeconds: 61, sizeBytes: 100 },
      { durationSeconds: 10, sizeBytes: null },
      { durationSeconds: 10, sizeBytes: 104_857_601 },
    ]) {
      probeMediaFromUrl.mockResolvedValueOnce(probe);
      await expect(
        service.libraryAsset('org', 'brand', 'video'),
      ).rejects.toThrow();
    }
  });
  it('analyzes attached Library media without probing the embed-only imported URL', async () => {
    const { service, probeMediaFromUrl } = setup();
    const config = {
      sourceSnapshot: {
        selector: { kind: 'source_post', sourcePostId: 'source' },
      },
      analysisSource: {
        assetId: 'video',
        assetUpdatedAt: '2026-09-24T00:00:00.000Z',
      },
    } as BrandRemixRunConfig;
    const result = await service.prepare('org', 'brand', config);
    expect(result.sourceAssetId).toBe('video');
    expect(probeMediaFromUrl).toHaveBeenCalledExactlyOnceWith(
      'https://cdn.test/owned-video',
      'video',
    );
    config.analysisSource!.assetUpdatedAt = '2026-09-23T00:00:00.000Z';
    await expect(service.prepare('org', 'brand', config)).rejects.toThrow(
      'changed',
    );
  });
});

vi.mock(
  '@api/collections/content-runs/services/brand-remix-source-resolver.service',
  () => ({ BrandRemixSourceResolverService: class {} }),
);
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/services/media-urls/media-url.service', () => ({
  MediaUrlService: class {},
}));
