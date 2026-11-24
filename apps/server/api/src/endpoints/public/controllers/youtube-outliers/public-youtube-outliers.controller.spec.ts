vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, serializer, value) => ({
    data: value,
    serializer,
  })),
}));

import { PublicYoutubeOutliersController } from '@api/endpoints/public/controllers/youtube-outliers/public-youtube-outliers.controller';
import type { PublicYoutubeOutliersService } from '@api/endpoints/public/services/public-youtube-outliers.service';
import type { IPublicYoutubeOutliersToolResult } from '@genfeedai/contracts/interfaces';
import { PublicYoutubeOutliersToolSerializer } from '@genfeedai/serializers';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

const result: IPublicYoutubeOutliersToolResult = {
  baselineSampleSize: 20,
  baselineViews: 1000,
  breakoutThreshold: 10,
  channelId: 'UCabcdefghijklmnopqrstuv',
  id: 'UCabcdefghijklmnopqrstuv',
  outlierThreshold: 3,
  outliers: [],
  status: 'ready',
  videosAnalyzed: 100,
};

describe('PublicYoutubeOutliersController', () => {
  it('is open to visitors without a session', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PublicYoutubeOutliersController.prototype.create,
      ),
    ).toBe(true);
  });

  it('serializes what the service found for the pasted channel', async () => {
    const asked: string[] = [];
    const service = {
      find: async (channel: string) => {
        asked.push(channel);
        return result;
      },
    } as unknown as PublicYoutubeOutliersService;

    const response = await new PublicYoutubeOutliersController(service).create(
      {} as Request,
      { channel: '@SomeChannel' },
    );

    expect(asked).toEqual(['@SomeChannel']);
    expect(response).toEqual({
      data: result,
      serializer: PublicYoutubeOutliersToolSerializer,
    });
  });
});
