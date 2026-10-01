import { StoryboardCharacterReplaceService } from '@api/collections/content-runs/services/storyboard-character-replace.service';
import type { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { STORYBOARD_CHARACTER_REPLACE_LIMITATIONS } from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadedConfig = {
  revision: 4,
  plan: { shots: [{ id: 'shot-1' }, { id: 'shot-2' }] },
  sourceSnapshot: {
    assetId: 'video-1',
    selector: { kind: 'uploaded_video', assetId: 'video-1' },
  },
};

function serviceWith(config: object = uploadedConfig) {
  const findMany = vi.fn();
  const read = vi.fn(async () => ({ config }));
  const save = vi.fn<StoryboardRunStoreService['save']>();
  const revalidate = vi.fn(async () => undefined);
  const libraryAsset = vi.fn(async () => ({
    durationSeconds: 8,
    sizeBytes: 1000,
    sourceAssetId: 'video-1',
    url: 'https://cdn.example/source.mp4',
  }));
  const generateMotionTransfer = vi.fn<
    HiggsFieldService['generateMotionTransfer']
  >(async () => ({ requestId: 'req-1' }));
  const buildUrl = vi.fn((key: string) => `https://cdn.example/${key}`);
  const service = new StoryboardCharacterReplaceService(
    { ingredient: { findMany } } as unknown as PrismaService,
    { read, save } as unknown as ConstructorParameters<
      typeof StoryboardCharacterReplaceService
    >[1],
    { revalidate } as unknown as ConstructorParameters<
      typeof StoryboardCharacterReplaceService
    >[2],
    { libraryAsset } as unknown as ConstructorParameters<
      typeof StoryboardCharacterReplaceService
    >[3],
    { generateMotionTransfer } as unknown as HiggsFieldService,
    { buildUrl } as unknown as MediaUrlService,
  );
  return {
    buildUrl,
    findMany,
    generateMotionTransfer,
    libraryAsset,
    revalidate,
    save,
    service,
  };
}

describe('StoryboardCharacterReplaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits Genjutsu motion transfer without charging or storing an output URL', async () => {
    const harness = serviceWith();
    harness.findMany.mockResolvedValue([
      { id: 'img-a', s3Key: 'a.jpg' },
      { id: 'img-b', s3Key: 'b.jpg' },
    ]);

    const replacement = await harness.service.replace(
      'org-1',
      'brand-1',
      'run-1',
      'shot-1',
      { imageAssetIds: ['img-b', 'img-a'], prompt: 'Keep the walk' },
    );

    expect(harness.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(harness.generateMotionTransfer).toHaveBeenCalledWith({
      imageUrls: ['https://cdn.example/b.jpg', 'https://cdn.example/a.jpg'],
      organizationId: 'org-1',
      prompt: 'Keep the walk',
      videoUrl: 'https://cdn.example/source.mp4',
    });
    expect(replacement).toMatchObject({
      chargedCredits: 0,
      limitations: [...STORYBOARD_CHARACTER_REPLACE_LIMITATIONS],
      modelKey: 'higgsfield/genjutsu/motion-transfer/v1.0',
      requestId: 'req-1',
      shotId: 'shot-1',
      status: 'submitted',
      videoAssetId: 'video-1',
    });
    expect(replacement).not.toHaveProperty('videoUrl');
    expect(harness.save).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'run-1',
      uploadedConfig,
      expect.objectContaining({
        characterReplacements: [replacement],
        revision: 4,
      }),
    );
    expect(JSON.stringify(harness.save.mock.calls[0]?.[4])).not.toContain(
      'videoUrl',
    );
  });

  it('marks the record ready when submit already returned a video and still drops that URL', async () => {
    const harness = serviceWith();
    harness.findMany.mockResolvedValue([{ id: 'img-a', s3Key: 'a.jpg' }]);
    harness.generateMotionTransfer.mockResolvedValue({
      requestId: 'req-2',
      videoUrl: 'https://provider.example/out.mp4',
    });

    const replacement = await harness.service.replace(
      'org-1',
      'brand-1',
      'run-1',
      'shot-1',
      { imageAssetIds: ['img-a'] },
    );

    expect(replacement.status).toBe('ready');
    expect(replacement).not.toHaveProperty('videoUrl');
    expect(JSON.stringify(harness.save.mock.calls[0]?.[4])).not.toContain(
      'provider.example',
    );
  });

  it('refuses a storyboard that has no owned source video', async () => {
    const harness = serviceWith({
      plan: { shots: [{ id: 'shot-1' }] },
      revision: 1,
      sourceSnapshot: { selector: { kind: 'brief', brief: 'Idea' } },
    });

    await expect(
      harness.service.replace('org-1', 'brand-1', 'run-1', 'shot-1', {
        imageAssetIds: ['img-a'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.revalidate).not.toHaveBeenCalled();
    expect(harness.generateMotionTransfer).not.toHaveBeenCalled();
  });

  it('refuses when a character image is missing from the brand library', async () => {
    const harness = serviceWith();
    harness.findMany.mockResolvedValue([]);

    await expect(
      harness.service.replace('org-1', 'brand-1', 'run-1', 'shot-1', {
        imageAssetIds: ['img-a'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.generateMotionTransfer).not.toHaveBeenCalled();
  });

  it('merges the accepted request onto the latest revision after a save conflict', async () => {
    const harness = serviceWith();
    harness.findMany.mockResolvedValue([{ id: 'img-a', s3Key: 'a.jpg' }]);
    const latest = { ...uploadedConfig, revision: 5 };
    harness.save
      .mockRejectedValueOnce(
        new ConflictException(
          'The storyboard changed during this save. Reload before retrying.',
        ),
      )
      .mockResolvedValueOnce({} as never);
    harness.read.mockResolvedValueOnce({ config: uploadedConfig });
    harness.read.mockResolvedValueOnce({ config: latest });

    const replacement = await harness.service.replace(
      'org-1',
      'brand-1',
      'run-1',
      'shot-1',
      { imageAssetIds: ['img-a'] },
    );

    expect(harness.generateMotionTransfer).toHaveBeenCalledTimes(1);
    expect(harness.save).toHaveBeenNthCalledWith(
      2,
      'org-1',
      'brand-1',
      'run-1',
      latest,
      expect.objectContaining({
        characterReplacements: [replacement],
        revision: 5,
      }),
    );
  });

  it('returns the stored request instead of submitting the same intent again', async () => {
    const stored = {
      chargedCredits: 0 as const,
      imageAssetIds: ['img-a'],
      limitations: [...STORYBOARD_CHARACTER_REPLACE_LIMITATIONS],
      modelKey: 'higgsfield/genjutsu/motion-transfer/v1.0' as const,
      requestId: 'req-kept',
      shotId: 'shot-1',
      status: 'submitted' as const,
      videoAssetId: 'video-1',
    };
    const harness = serviceWith({
      ...uploadedConfig,
      characterReplacements: [stored],
    });

    const replacement = await harness.service.replace(
      'org-1',
      'brand-1',
      'run-1',
      'shot-1',
      { imageAssetIds: ['img-a'] },
    );

    expect(replacement).toEqual(stored);
    expect(harness.generateMotionTransfer).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
  });
});
