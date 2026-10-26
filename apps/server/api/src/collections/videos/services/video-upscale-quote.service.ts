import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { assertSupportedVideoUpscaleOptions } from '@api/collections/videos/utils/video-upscale-options.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface VideoUpscaleQuoteRequest {
  model: string;
  targetFps: number;
  targetResolution: string;
}

/**
 * What an upscale will cost, priced the way CreditsGuard prices the charge:
 * Topaz bills per second of the stored source video at the target resolution
 * and frame rate, so the picker can show the real amount before any spend.
 */
@Injectable()
export class VideoUpscaleQuoteService {
  constructor(
    private readonly modelCreditQuote: ModelCreditQuoteService,
    private readonly modelsService: ModelsService,
    private readonly prisma: PrismaService,
  ) {}

  async quote(
    organizationId: string,
    videoId: string,
    request: VideoUpscaleQuoteRequest,
  ): Promise<number> {
    const { model, targetFps, targetResolution } = request;
    assertSupportedVideoUpscaleOptions(model, targetResolution, targetFps);

    const isTopaz = model === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE;
    const video = await this.prisma.ingredient.findFirst({
      select: { metadata: { select: { duration: true } } },
      where: scopedWhere(organizationId, {
        category: IngredientCategory.VIDEO,
        id: videoId,
      }),
    });
    if (!video) {
      throw new NotFoundException('Video', videoId);
    }

    const duration = video.metadata?.duration ?? 0;
    if (isTopaz && !(duration > 0)) {
      throw new BadRequestException(
        'The source video length is unknown, so this upscale cannot be priced.',
      );
    }

    const catalogModel = await this.modelsService.findOne({ key: model });
    const snapshot = await this.modelCreditQuote.quoteSnapshotByKey(model, {
      organizationId,
      outputs: 1,
      requests: 1,
      ...(catalogModel?.provider ? { provider: catalogModel.provider } : {}),
      ...(isTopaz
        ? {
            duration,
            selectors: {
              target_fps: targetFps,
              target_resolution: targetResolution,
            },
          }
        : {}),
    });

    return snapshot.credits;
  }
}
