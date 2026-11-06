import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideosUpscaleQuoteController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale-quote.controller';
import type { VideoUpscaleQuoteService } from '@api/collections/videos/services/video-upscale-quote.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { Request } from 'express';

const MODEL = MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE;
const user = { id: 'user-1', organizationId: 'org-1' } as unknown as User;
const request = {
  params: { videoId: 'video-1' },
  query: {},
} as unknown as Request;

/**
 * The endpoint over a price list keyed by organization, video, resolution and
 * frame rate; a quote the list does not hold is an error, so a wrong default
 * or a lost option fails the call.
 */
function controllerPricing(prices: Record<string, number>) {
  const quoteService = {
    quote: async (
      organizationId: string,
      videoId: string,
      options: { model: string; targetFps: number; targetResolution: string },
    ) => {
      const key = `${organizationId}/${videoId}/${options.model}/${options.targetResolution}@${options.targetFps}`;
      const price = prices[key];
      if (price === undefined) {
        throw new Error(`no price for ${key}`);
      }
      return price;
    },
  };
  return new VideosUpscaleQuoteController(
    quoteService as unknown as VideoUpscaleQuoteService,
  );
}

const prices = {
  [`org-1/video-1/${MODEL}/1080p@30`]: 41,
  [`org-1/video-1/${MODEL}/4k@60`]: 80,
};

describe('VideosUpscaleQuoteController', () => {
  it.each([
    ['the default 1080p at 30 fps', {}, 41],
    ['the chosen 4k at 60 fps', { targetFps: 60, targetResolution: '4k' }, 80],
  ] as const)(
    'quotes %s for the caller organization',
    async (_case, options, credits) => {
      const response = await controllerPricing(prices).findUpscaleQuote(
        request,
        user,
        'video-1',
        { model: MODEL, ...options },
      );

      expect(response.data).toMatchObject({
        attributes: { credits },
        id: 'video-1',
      });
    },
  );

  it('refuses a caller with no organization', async () => {
    await expect(
      controllerPricing(prices).findUpscaleQuote(
        request,
        { id: 'user-1' } as unknown as User,
        'video-1',
        { model: MODEL },
      ),
    ).rejects.toThrow('An organization is required to quote');
  });
});
