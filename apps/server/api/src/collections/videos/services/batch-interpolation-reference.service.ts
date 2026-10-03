import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { InterpolationPairDto } from '@api/collections/videos/dto/batch-interpolation.dto';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
  ): Promise<{
    endFrameUrl?: string;
    sourceIngredientIds: string[];
    startFrameUrl?: string;
  }> {
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
    // A frame may be an Asset (logo, banner, reference), which is not an
    // Ingredient: only Ingredient ids can be connected as `sources`.
    const ingredients = await this.ingredientsService.findByIds(
      [...new Set([pair.startImageId, pair.endImageId])],
      organizationId,
    );
    return {
      endFrameUrl: endFrameUrls[0],
      sourceIngredientIds: ingredients.map((ingredient) => ingredient.id),
      startFrameUrl: startFrameUrls[0],
    };
  }
}
