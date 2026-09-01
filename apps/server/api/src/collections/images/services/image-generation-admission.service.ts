import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { ImagesService } from '@server/collections/images/services/images.service';
import type { IngredientDocument } from '@server/collections/ingredients/schemas/ingredient.schema';
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
    private readonly creditsService: ImageGenerationCreditsService,
    private readonly imagesService: ImagesService,
  ) {}

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
