import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import { CredentialPlatform, IngredientCategory } from '@genfeedai/contracts';
import type { MediaProbe } from '@genfeedai/contracts/api-types/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';

const PROBED_AT = '2026-09-19T10:00:00.000Z';

function videoProbe(overrides: Partial<MediaProbe> = {}): MediaProbe {
  return {
    audioCodec: 'aac',
    container: 'mov,mp4,m4a,3gp,3g2,mj2',
    durationSeconds: 30,
    frameRate: 30,
    height: 1920,
    kind: 'video',
    probedAt: PROBED_AT,
    sizeBytes: 12 * 1024 * 1024,
    videoCodec: 'h264',
    width: 1080,
    ...overrides,
  };
}

function makeHarness(
  rows: Record<string, unknown>[],
  probeResult: MediaProbe = videoProbe(),
) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const probeMediaFromUrl = vi.fn().mockResolvedValue(probeResult);
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const service = new MediaReadinessService(
    { ingredient: { findMany, updateMany } } as unknown as PrismaService,
    { probeMediaFromUrl } as unknown as FilesClientService,
    logger as unknown as LoggerService,
  );
  return { findMany, logger, probeMediaFromUrl, service, updateMany };
}

describe('MediaReadinessService', () => {
  it('scopes the asset lookup to the organization and live rows', async () => {
    const { findMany, service } = makeHarness([]);

    await service.evaluatePublishReadiness({
      assetIds: ['asset-1', 'asset-1', ''],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['asset-1'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('probes an asset without probe metadata once and persists the result', async () => {
    const { probeMediaFromUrl, service, updateMany } = makeHarness([
      {
        category: IngredientCategory.VIDEO,
        cdnUrl: 'https://cdn.example.com/clip.mp4',
        fileSize: null,
        id: 'asset-1',
        mediaProbe: null,
      },
    ]);

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(probeMediaFromUrl).toHaveBeenCalledExactlyOnceWith(
      'https://cdn.example.com/clip.mp4',
      'video',
    );
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        mediaProbe: videoProbe(),
        mediaProbedAt: new Date(PROBED_AT),
      },
      where: { id: 'asset-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(report.diagnostics).toEqual([]);
  });

  it('reuses persisted probe metadata instead of probing again', async () => {
    const { probeMediaFromUrl, service, updateMany } = makeHarness([
      {
        category: IngredientCategory.VIDEO,
        cdnUrl: 'https://cdn.example.com/clip.mp4',
        fileSize: null,
        id: 'asset-1',
        mediaProbe: videoProbe({ durationSeconds: 1200 }),
      },
    ]);

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(probeMediaFromUrl).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(report.isBlocked).toBe(true);
    expect(report.diagnostics[0]).toEqual(
      expect.objectContaining({ property: 'duration', severity: 'error' }),
    );
  });

  it('falls back to the recorded upload size when the probe reports none', async () => {
    const { service, updateMany } = makeHarness(
      [
        {
          category: IngredientCategory.IMAGE,
          cdnUrl: 'https://cdn.example.com/card.jpg',
          fileSize: 4096,
          id: 'asset-1',
          mediaProbe: null,
        },
      ],
      {
        audioCodec: null,
        container: 'jpeg',
        durationSeconds: null,
        frameRate: null,
        height: 1350,
        kind: 'image',
        probedAt: PROBED_AT,
        sizeBytes: null,
        videoCodec: null,
        width: 1080,
      },
    );

    await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.INSTAGRAM],
    });

    expect(updateMany.mock.calls[0]?.[0]?.data?.mediaProbe?.sizeBytes).toBe(
      4096,
    );
  });

  it('discards unreadable persisted probe metadata and re-probes', async () => {
    const { logger, probeMediaFromUrl, service } = makeHarness([
      {
        category: IngredientCategory.VIDEO,
        cdnUrl: 'https://cdn.example.com/clip.mp4',
        fileSize: null,
        id: 'asset-1',
        mediaProbe: { legacy: true },
      },
    ]);

    await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(logger.warn).toHaveBeenCalled();
    expect(probeMediaFromUrl).toHaveBeenCalledOnce();
  });

  it('degrades to a spec-severity probe diagnostic when probing fails', async () => {
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const service = new MediaReadinessService(
      {
        ingredient: {
          findMany: vi.fn().mockResolvedValue([
            {
              category: IngredientCategory.VIDEO,
              cdnUrl: 'https://cdn.example.com/clip.mp4',
              fileSize: null,
              id: 'asset-1',
              mediaProbe: null,
            },
          ]),
          updateMany: vi.fn(),
        },
      } as unknown as PrismaService,
      {
        probeMediaFromUrl: vi.fn().mockRejectedValue(new Error('files down')),
      } as unknown as FilesClientService,
      logger as unknown as LoggerService,
    );

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(logger.error).toHaveBeenCalled();
    expect(report.isBlocked).toBe(false);
    expect(report.diagnostics[0]).toEqual(
      expect.objectContaining({ property: 'probe', severity: 'warning' }),
    );
  });

  it('ignores assets whose category carries no measurable media', async () => {
    const { probeMediaFromUrl, service } = makeHarness([
      {
        category: IngredientCategory.TEXT,
        cdnUrl: 'https://cdn.example.com/body.txt',
        fileSize: 10,
        id: 'asset-1',
        mediaProbe: null,
      },
    ]);

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(probeMediaFromUrl).not.toHaveBeenCalled();
    expect(report.diagnostics).toEqual([]);
  });

  it('blocks an attached id the tenant-scoped lookup did not return', async () => {
    const { service } = makeHarness([]);

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-missing'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(report.isBlocked).toBe(true);
    expect(report.diagnostics[0]).toEqual(
      expect.objectContaining({
        assetId: 'asset-missing',
        code: 'media_asset_unresolved',
        property: 'asset',
        severity: 'error',
      }),
    );
  });

  it('does not treat a resolved non-media attachment as unresolved', async () => {
    const { service } = makeHarness([
      {
        category: IngredientCategory.TEXT,
        cdnUrl: 'https://cdn.example.com/body.txt',
        fileSize: 10,
        id: 'asset-1',
        mediaProbe: null,
      },
    ]);

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(report.isBlocked).toBe(false);
    expect(report.diagnostics).toEqual([]);
  });

  it('keeps a successful probe when the cache write fails', async () => {
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    const service = new MediaReadinessService(
      {
        ingredient: {
          findMany: vi.fn().mockResolvedValue([
            {
              category: IngredientCategory.VIDEO,
              cdnUrl: 'https://cdn.example.com/clip.mp4',
              fileSize: null,
              id: 'asset-1',
              mediaProbe: null,
            },
          ]),
          updateMany: vi.fn().mockRejectedValue(new Error('write conflict')),
        },
      } as unknown as PrismaService,
      {
        probeMediaFromUrl: vi
          .fn()
          .mockResolvedValue(videoProbe({ durationSeconds: 1200 })),
      } as unknown as FilesClientService,
      logger as unknown as LoggerService,
    );

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.TIKTOK],
    });

    expect(logger.warn).toHaveBeenCalled();
    // The measurement survived the failed cache write, so the duration limit
    // was still checked rather than degrading to "unprobed".
    expect(report.isBlocked).toBe(true);
    expect(report.diagnostics[0]).toEqual(
      expect.objectContaining({ property: 'duration', severity: 'error' }),
    );
  });

  it('skips the lookup entirely when no target platform has a seeded spec', async () => {
    const { findMany, service } = makeHarness([]);

    const report = await service.evaluatePublishReadiness({
      assetIds: ['asset-1'],
      organizationId: 'org-1',
      platforms: [CredentialPlatform.SLACK],
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(report).toEqual(
      expect.objectContaining({ diagnostics: [], isBlocked: false }),
    );
  });
});
