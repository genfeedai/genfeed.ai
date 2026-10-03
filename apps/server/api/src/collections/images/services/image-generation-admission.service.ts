import { AssetsService } from '@api/collections/assets/services/assets.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { EditImageDto } from '@api/collections/images/dto/edit-image.dto';
import type { ImageEditingContext } from '@api/collections/images/services/image-generation.types';
import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { replaceDispatchReferenceIds } from '@api/collections/images/services/image-generation-dispatch-references.util';
import { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildReferenceImageUrls } from '@api/helpers/utils/reference/reference.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  FLUX_3_EDIT_CONTRACT_VERSION,
  getImageEditMaxSources,
  IMAGE_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_QUALITY,
  isFlux3AspectRatio,
  isFlux3ImageModel,
  isFlux3Resolution,
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
    private readonly personasService: PersonasService,
  ) {}

  /**
   * Character references in a generation request: rejects one the active
   * brand can no longer use and returns the character to link the output to.
   */
  resolveCharacterLink(
    organizationId: string,
    brandId: string,
    referenceIds: string[],
  ): Promise<{ availableAvatarIds: Set<string>; personaId: string | null }> {
    return this.personasService.resolveCharacterReferences({
      brandId,
      ingredientIds: referenceIds,
      organizationId,
    });
  }

  async admitImageEdit(
    sourceId: string,
    dto: EditImageDto,
    organizationId: string,
    brandId: string,
  ): Promise<ImageEditingContext> {
    const sourceIds = [sourceId, ...(dto.references ?? [])];
    const flux = isFlux3ImageModel(dto.model ?? '');
    if (flux) this.assertFlux3Controls(dto);
    const size = dto.maskId ? 'source' : (dto.size ?? 'source');
    if (
      !dto.prompt?.trim() ||
      !isImageEditSize(dto.size ?? 'source') ||
      sourceIds.length > getImageEditMaxSources(dto.model) ||
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
        flux
          ? 'Provide an instruction, one to ten distinct source images, valid native settings and one output.'
          : 'Provide an instruction, one to five distinct source images, a valid size and one to eight outputs.',
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
    if (flux) for (const { image } of images) this.assertFlux3Source(image);
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
      recipe: flux
        ? {
            contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
            operation: 'image-edit',
            model: dto.model ?? '',
            sourceIds,
            outputs: 1,
            resolution: dto.resolution ?? '1k',
            aspectRatio: dto.aspectRatio ?? 'auto',
            grounding: false,
          }
        : {
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

  assertFlux3Controls(dto: {
    outputs?: number;
    seed?: number;
    maskId?: string;
    size?: string;
    quality?: string;
    resolution?: string;
    aspectRatio?: string;
  }): void {
    if (
      (dto.outputs ?? 1) !== 1 ||
      dto.seed !== undefined ||
      dto.maskId !== undefined ||
      dto.size !== undefined ||
      dto.quality !== undefined ||
      !isFlux3Resolution(dto.resolution ?? '1k') ||
      !isFlux3AspectRatio(dto.aspectRatio ?? 'auto')
    )
      throw new BadRequestException(
        'FLUX.3 supports one output, native resolution and aspect ratio; masks, seeds and quality are unavailable.',
      );
  }

  private assertFlux3Source(image: IngredientDocument): void {
    const width = image.metadata?.width;
    const height = image.metadata?.height;
    const extension = String(image.metadata?.extension ?? '').toLowerCase();
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      !width ||
      !height ||
      width < 256 ||
      height < 256 ||
      width * height > 16000000 ||
      !['jpeg', 'jpg', 'png', 'gif', 'webp'].includes(extension)
    )
      throw new BadRequestException(
        'FLUX.3 sources must be JPEG, PNG, GIF or WebP, at least 256×256 pixels and at most 16 megapixels.',
      );
  }

  async resolveFlux3References(
    organizationId: string,
    brandId: string,
    sourceIds: string[],
  ): Promise<string[]> {
    if (
      sourceIds.length > 10 ||
      new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.some((id) => !isEntityId(id))
    )
      throw new BadRequestException(
        'Choose at most ten distinct source images.',
      );
    // A shared character's reference image belongs to its owning brand; it is
    // usable here when the character is available to the active brand.
    const { availableAvatarIds } = await this.resolveCharacterLink(
      organizationId,
      brandId,
      sourceIds,
    );
    for (const id of sourceIds) {
      const image = await this.imagesService.findOne(
        {
          id,
          organizationId,
          ...(availableAvatarIds.has(id) ? {} : { brandId }),
          isDeleted: false,
          category: IngredientCategory.IMAGE,
        },
        [PopulatePatterns.metadataFull],
      );
      if (!image) throw new NotFoundException('Reference image');
      if (
        ![
          IngredientStatus.GENERATED,
          IngredientStatus.UPLOADED,
          IngredientStatus.VALIDATED,
        ].includes(image.status as IngredientStatus) ||
        !(image.s3Key || image.cdnUrl)
      )
        throw new BadRequestException(
          'Wait for the reference image to finish processing.',
        );
      this.assertFlux3Source(image);
    }
    return sourceIds.map(
      (id) => `${this.configService.ingredientsEndpoint}/images/${id}`,
    );
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
