import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideosUpscaleQuoteController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale-quote.controller';
import type { VideoUpscaleQuoteService } from '@api/collections/videos/services/video-upscale-quote.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const organizationId = testId('org');
const videoId = testId('video');
const user = {
  id: testId('user'),
  organizationId,
  userId: testId('user'),
} as unknown as User;
const request = { params: { videoId }, query: {} } as unknown as Request;

describe('VideosUpscaleQuoteController', () => {
  it('quotes the video for the caller organization with the default options', async () => {
    const quote = vi.fn().mockResolvedValue(41);
    const controller = new VideosUpscaleQuoteController({
      quote,
    } as unknown as VideoUpscaleQuoteService);

    await expect(
      controller.findUpscaleQuote(request, user, videoId, {
        model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      }),
    ).resolves.toEqual({ data: { credits: 41, id: videoId } });
    expect(quote).toHaveBeenCalledWith(organizationId, videoId, {
      model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      targetFps: 30,
      targetResolution: '1080p',
    });
  });

  it('passes the chosen resolution and frame rate through', async () => {
    const quote = vi.fn().mockResolvedValue(80);
    const controller = new VideosUpscaleQuoteController({
      quote,
    } as unknown as VideoUpscaleQuoteService);

    await controller.findUpscaleQuote(request, user, videoId, {
      model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      targetFps: 60,
      targetResolution: '4k',
    });

    expect(quote).toHaveBeenCalledWith(organizationId, videoId, {
      model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      targetFps: 60,
      targetResolution: '4k',
    });
  });

  it('refuses a caller with no organization', async () => {
    const quote = vi.fn();
    const controller = new VideosUpscaleQuoteController({
      quote,
    } as unknown as VideoUpscaleQuoteService);

    await expect(
      controller.findUpscaleQuote(
        request,
        { id: testId('user') } as unknown as User,
        videoId,
        { model: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE },
      ),
    ).rejects.toThrow('organization is required');
    expect(quote).not.toHaveBeenCalled();
  });
});
