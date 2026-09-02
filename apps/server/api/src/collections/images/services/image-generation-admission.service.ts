import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { AssetsService } from '@server/collections/assets/services/assets.service';
import { ImagesService } from '@server/collections/images/services/images.service';
import type { IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { PopulatePatterns } from '@server/shared/utils/populate/populate.util';

const IMAGE_POPULATE = [
  PopulatePatterns.promptFull,
  PopulatePatterns.metadataFull,
  PopulatePatterns.brandMinimal,
];
const PROVIDER_DISPATCH_GRACE_MS = 5 * 60 * 1000;

@Injectable()
export class ImageGenerationAdmissionService {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly configService: ConfigService,
    private readonly creditsService: ImageGenerationCreditsService,
    private readonly imagesService: ImagesService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
  ) {}

  resolveReferenceImageUrls(
    organizationId: string,
    referenceIds: string[],
  ): Promise<string[]> {
    return buildReferenceImageUrls({
      assetsService: this.assetsService,
      configService: this.configService,
      ingredientsService: this.ingredientsService,
      loggerService: this.loggerService,
      organizationId,
      referenceIds,
    });
  }

  async findReusableIngredient(
    sourceActionId: string | undefined,
    organizationId: string,
  ): Promise<IngredientDocument | null> {
    if (!sourceActionId) {
      return null;
    }
    const accepted = await this.imagesService.findOne(
      {
        category: IngredientCategory.IMAGE,
        isDeleted: false,
        organizationId,
        sourceActionId,
        status: {
          in: [
            IngredientStatus.PROCESSING,
            IngredientStatus.GENERATED,
            IngredientStatus.VALIDATED,
          ],
        },
      },
      IMAGE_POPULATE,
    );
    if (!accepted) {
      return null;
    }
    const freshUndispatched =
      accepted.status === IngredientStatus.PROCESSING &&
      !accepted.metadata?.externalId &&
      accepted.createdAt instanceof Date &&
      Date.now() - accepted.createdAt.getTime() < PROVIDER_DISPATCH_GRACE_MS;
    const wasDispatched =
      accepted.status !== IngredientStatus.PROCESSING ||
      Boolean(accepted.metadata?.externalId) ||
      freshUndispatched;
    if (wasDispatched) {
      return accepted;
    }
    await this.imagesService.patch(accepted.id, {
      status: IngredientStatus.FAILED,
    });
    return null;
  }

  async ensureCredits(
    dto: CreateImageDto,
    model: string,
    organizationId: string,
    request: Request,
    onCreditsPrepared?: () => Promise<void>,
  ): Promise<void> {
    await this.creditsService.ensureDeferredCredits(
      dto,
      model,
      organizationId,
      request,
    );
    await onCreditsPrepared?.();
  }
}
