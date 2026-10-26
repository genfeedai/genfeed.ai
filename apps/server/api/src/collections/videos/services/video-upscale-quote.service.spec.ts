import type { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { VideoUpscaleQuoteService } from '@api/collections/videos/services/video-upscale-quote.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';

const organizationId = testId('org');
const videoId = testId('video');

function createService(options: { duration?: number | null; video?: boolean }) {
  const findFirst = vi.fn().mockResolvedValue(
    options.video === false
      ? null
      : {
          metadata:
            options.duration === null
              ? null
              : { duration: options.duration ?? 6 },
        },
  );
  const quoteSnapshotByKey = vi.fn().mockResolvedValue({ credits: 41 });
  const findOne = vi.fn().mockResolvedValue({ provider: 'replicate' });
  const service = new VideoUpscaleQuoteService(
    { quoteSnapshotByKey } as unknown as ModelCreditQuoteService,
    { findOne } as unknown as ModelsService,
    { ingredient: { findFirst } } as unknown as PrismaService,
  );

  return { findFirst, quoteSnapshotByKey, service };
}

describe('VideoUpscaleQuoteService', () => {
  it('prices Topaz per second of the stored source at the target options', async () => {
    const { findFirst, quoteSnapshotByKey, service } = createService({
      duration: 6,
    });

    await expect(
      service.quote(organizationId, videoId, {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 30,
        targetResolution: '1080p',
      }),
    ).resolves.toBe(41);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: videoId, organizationId }),
      }),
    );
    expect(quoteSnapshotByKey).toHaveBeenCalledWith(
      MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      expect.objectContaining({
        duration: 6,
        organizationId,
        provider: 'replicate',
        selectors: { target_fps: 30, target_resolution: '1080p' },
      }),
    );
  });

  it('quotes the ByteDance upscaler without a source duration', async () => {
    const { quoteSnapshotByKey, service } = createService({ duration: null });

    await service.quote(organizationId, videoId, {
      model: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
      targetFps: 60,
      targetResolution: '2k',
    });

    const input = quoteSnapshotByKey.mock.calls[0]?.[1];
    expect(input).not.toHaveProperty('duration');
    expect(input).not.toHaveProperty('selectors');
  });

  it('refuses to price a Topaz upscale whose source length is unknown', async () => {
    const { quoteSnapshotByKey, service } = createService({ duration: null });

    await expect(
      service.quote(organizationId, videoId, {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 30,
        targetResolution: '1080p',
      }),
    ).rejects.toThrow('source video length is unknown');
    expect(quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('rejects options the model does not support, as the charge does', async () => {
    const { quoteSnapshotByKey, service } = createService({});

    await expect(
      service.quote(organizationId, videoId, {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 30,
        targetResolution: '2k',
      }),
    ).rejects.toThrow('does not support target resolution');
    expect(quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('answers not found for a video outside the organization', async () => {
    const { service } = createService({ video: false });

    await expect(
      service.quote(organizationId, videoId, {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        targetFps: 30,
        targetResolution: '1080p',
      }),
    ).rejects.toThrow('not found');
  });
});
