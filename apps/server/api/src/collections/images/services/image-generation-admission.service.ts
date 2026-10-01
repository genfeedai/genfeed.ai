import { AssetsService } from '@api/collections/assets/services/assets.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { EditImageDto } from '@api/collections/images/dto/edit-image.dto';
import type { ImageEditingContext } from '@api/collections/images/services/image-generation.types';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { replaceDispatchReferenceIds } from '@api/collections/images/services/image-generation-dispatch-references.util';
import { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  IMAGE_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_MAX_SOURCES,
  IMAGE_EDIT_QUALITY,
  isImageEditSize,
} from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

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

  async admitImageEdit(
    sourceId: string,
    dto: EditImageDto,
    organizationId: string,
    brandId: string,
  ): Promise<ImageEditingContext> {
    const sourceIds = [sourceId, ...(dto.references ?? [])];
    const size = dto.maskId ? 'source' : (dto.size ?? 'source');
    if (
      !dto.prompt?.trim() ||
      !isImageEditSize(dto.size ?? 'source') ||
      sourceIds.length > IMAGE_EDIT_MAX_SOURCES ||
      new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.some((id) => !isEntityId(id)) ||
      (dto.maskId && !isEntityId(dto.maskId)) ||
      !Number.isInteger(dto.outputs ?? 1) ||
      (dto.outputs ?? 1) < 1 ||
      (dto.outputs ?? 1) > 8 ||
      (dto.seed !== undefined &&
        (!Number.isInteger(dto.seed) || dto.seed < 0 || dto.seed > 2147483647))
    ) {
      throw new BadRequestException(
        'Provide an instruction, one to five distinct source images, a valid size and one to eight outputs.',
      );
    }
    const findReadyImage = async (id: string) => {
      const image = await this.imagesService.findOne(
        {
          id,
          organizationId,
          brandId,
          isDeleted: false,
          category: IngredientCategory.IMAGE,
        },
        [PopulatePatterns.metadataFull],
      );
      if (!image) throw new NotFoundException('Editing image');
      if (
        ![
          IngredientStatus.GENERATED,
          IngredientStatus.VALIDATED,
          IngredientStatus.UPLOADED,
        ].includes(image.status as IngredientStatus) ||
        !image.metadata ||
        typeof image.metadata.width !== 'number' ||
        typeof image.metadata.height !== 'number' ||
        !Number.isFinite(image.metadata.width) ||
        !Number.isFinite(image.metadata.height) ||
        image.metadata.width <= 0 ||
        image.metadata.height <= 0 ||
        !(image.s3Key || image.cdnUrl)
      ) {
        throw new BadRequestException(
          'Wait for the image to finish processing before editing it.',
        );
      }
      return {
        image,
        width: image.metadata.width,
        height: image.metadata.height,
      };
    };
    const images = await Promise.all(sourceIds.map(findReadyImage));
    const primary = images[0];
    const sourceWidth = primary.width;
    const sourceHeight = primary.height;
    if (dto.maskId) {
      const mask = await findReadyImage(dto.maskId);
      if (mask.width !== sourceWidth || mask.height !== sourceHeight) {
        throw new BadRequestException(
          'The mask dimensions must match the source image.',
        );
      }
    }
    const [width, height] =
      size === 'source'
        ? [sourceWidth, sourceHeight]
        : size.split('x').map(Number);
    return {
      sourceIds,
      sourceUrls: sourceIds.map(
        (id) => `${this.configService.ingredientsEndpoint}/images/${id}`,
      ),
      ...(dto.maskId
        ? {
            maskUrl: `${this.configService.ingredientsEndpoint}/images/${dto.maskId}`,
          }
        : {}),
      size,
      width,
      height,
      recipe: {
        contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
        operation: 'image-edit',
        model: dto.model ?? '',
        sourceIds,
        ...(dto.maskId ? { maskId: dto.maskId } : {}),
        size,
        quality: IMAGE_EDIT_QUALITY,
        outputs: dto.outputs ?? 1,
        ...(dto.seed !== undefined ? { seed: dto.seed } : {}),
      },
    };
  }

  /**
   * Brief compilers write reference ids into the provider dispatch; providers
   * need URLs. Ids that do not resolve for this organization (foreign,
   * deleted, or missing) are dropped so they never reach the provider.
   */
  async resolveDispatchReferences(
    compiled: {
      brief?: { references: readonly { assetId: string }[] };
      dispatch?: Record<string, unknown>;
    },
    organizationId: string,
  ): Promise<Record<string, unknown> | undefined> {
    if (!compiled.dispatch) {
      return undefined;
    }

    const urlByReferenceId = new Map<string, string>();
    const unresolvedReferenceIds = new Set<string>();
    const referenceIds = new Set(
      compiled.brief?.references.map((reference) => reference.assetId),
    );
    for (const referenceId of referenceIds) {
      const [url] = await this.resolveReferenceImageUrls(organizationId, [
        referenceId,
      ]);
      if (url) {
        urlByReferenceId.set(referenceId, url);
      } else {
        unresolvedReferenceIds.add(referenceId);
      }
    }

    return replaceDispatchReferenceIds(
      compiled.dispatch,
      urlByReferenceId,
      unresolvedReferenceIds,
    );
  }

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

  assertApprovedQuote(
    dto: CreateImageDto,
    model: string,
    organizationId: string,
    request: Request,
  ): Promise<void> {
    return this.creditsService.assertApprovedQuote(
      dto,
      model,
      organizationId,
      request,
    );
  }

  async ensureCredits(
    dto: CreateImageDto,
    model: string,
    organizationId: string,
    request: Request,
    onCreditsPrepared?: () => Promise<void>,
    providerInput?: Record<string, unknown>,
  ): Promise<void> {
    await this.creditsService.ensureDeferredCredits(
      dto,
      model,
      organizationId,
      request,
      providerInput,
    );
    await onCreditsPrepared?.();
  }
}
