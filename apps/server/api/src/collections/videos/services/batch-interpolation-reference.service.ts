import type { InterpolationPairDto } from '@api/collections/videos/dto/batch-interpolation.dto';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { AssetsService } from '@server/collections/assets/services/assets.service';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';

@Injectable()
export class BatchInterpolationReferenceService {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly configService: ConfigService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
  ) {}

  async resolvePair(
    pair: InterpolationPairDto,
    organizationId: string,
  ): Promise<{ endFrameUrl?: string; startFrameUrl?: string }> {
    const [startFrameUrls, endFrameUrls] = await Promise.all([
      buildReferenceImageUrls({
        assetsService: this.assetsService,
        configService: this.configService,
        ingredientsService: this.ingredientsService,
        loggerService: this.loggerService,
        organizationId,
        referenceIds: [pair.startImageId],
      }),
      buildReferenceImageUrls({
        assetsService: this.assetsService,
        configService: this.configService,
        ingredientsService: this.ingredientsService,
        loggerService: this.loggerService,
        organizationId,
        referenceIds: [pair.endImageId],
      }),
    ]);
    return {
      endFrameUrl: endFrameUrls[0],
      startFrameUrl: startFrameUrls[0],
    };
  }
}
