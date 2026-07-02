import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { GenerateImageDto } from '@api/endpoints/admin/fleet/dto/generate-image.dto';
import { AdminFleetGenerationJob } from '@api/endpoints/admin/fleet/interfaces/fleet-generation-job.interface';
import { AdminFleetCharacterService } from '@api/endpoints/admin/fleet/services/fleet-character.service';
import { AdminFleetValueReader } from '@api/endpoints/admin/fleet/services/fleet-value-reader.util';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  DarkroomReviewStatus as DarkroomReviewStatusEnum,
  FileInputType,
  IngredientStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';

/**
 * Owns fleet image generation: the synchronous ComfyUI generate path and
 * the durable generation-job lifecycle.
 */
@Injectable()
export class AdminFleetGenerationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly characterService: AdminFleetCharacterService,
    private readonly ingredientsService: IngredientsService,
    private readonly comfyuiService: ComfyUIService,
    private readonly filesClientService: FilesClientService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Generate an image for a character using ComfyUI.
   */
  @SentryTraced()
  async generateImage(
    organizationId: string,
    brandId: string,
    userId: string,
    personaSlug: string,
    prompt: string,
    options: {
      model?: string;
      negativePrompt?: string;
      steps?: number;
      seed?: number;
      cfgScale?: number;
      width?: number;
      height?: number;
      lora?: string;
      loraStrength?: number;
      ingredientId?: string;
    },
  ): Promise<IngredientDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      personaSlug,
      prompt,
    });

    // Verify persona exists
    const persona = await this.characterService.requirePersonaBySlug(
      personaSlug,
      organizationId,
    );

    // Determine model and parameters
    const model = options.model || MODEL_KEYS.GENFEED_AI_FLUX2_DEV;
    const comfyParams: Record<string, unknown> = {
      prompt,
    };

    if (options.negativePrompt) {
      comfyParams.negativePrompt = options.negativePrompt;
    }
    if (options.steps) {
      comfyParams.steps = options.steps;
    }
    if (options.seed !== undefined) {
      comfyParams.seed = options.seed;
    }
    if (options.cfgScale) {
      comfyParams.cfg = options.cfgScale;
    }
    if (options.width) {
      comfyParams.width = options.width;
    }
    if (options.height) {
      comfyParams.height = options.height;
    }
    if (options.lora) {
      comfyParams.loraPath = options.lora;
    }
    if (options.loraStrength) {
      comfyParams.loraStrength = options.loraStrength;
    }

    // Generate image via ComfyUI
    const { imageBuffer, filename } = await this.comfyuiService.generateImage(
      model,
      comfyParams,
    );

    if (options.ingredientId) {
      await this.ingredientsService.patch(options.ingredientId, {
        generationProgress: 90,
        generationStage: 'uploading',
        status: IngredientStatus.PROCESSING,
      });
    }

    // Upload image buffer to S3 via files microservice
    const s3Meta = await this.filesClientService.uploadToS3(
      `darkroom/${personaSlug}/${filename}`,
      'images',
      {
        contentType: 'image/png',
        data: imageBuffer,
        type: FileInputType.BUFFER,
      },
    );
    const cdnUrl =
      s3Meta.publicUrl ??
      `https://cdn.genfeed.ai/darkroom/${personaSlug}/${filename}`;

    const ingredient =
      options.ingredientId === undefined
        ? await this.ingredientsService.create({
            brand: ObjectIdUtil.toObjectId(brandId)!,
            cdnUrl,
            ...AdminFleetValueReader.getDefaultFleetModerationState(),
            generationSource: model,
            modelUsed: model,
            organization: ObjectIdUtil.toObjectId(organizationId)!,
            persona: persona._id,
            personaSlug,
            s3Key: `darkroom/${personaSlug}/${filename}`,
            status: IngredientStatus.GENERATED,
            user: ObjectIdUtil.toObjectId(userId)!,
          } as Parameters<IngredientsService['create']>[0])
        : await this.ingredientsService.patch(options.ingredientId, {
            cdnUrl,
            generationCompletedAt: new Date(),
            generationError: undefined,
            generationProgress: 100,
            generationSource: model,
            generationStage: 'completed',
            modelUsed: model,
            reviewStatus: DarkroomReviewStatusEnum.PENDING,
            s3Key: `darkroom/${personaSlug}/${filename}`,
            status: IngredientStatus.GENERATED,
          });

    this.loggerService.log(caller, {
      ingredientId: ingredient._id.toString(),
      message: 'Image generated successfully',
    });

    return ingredient;
  }

  async createGenerationJob(
    organizationId: string,
    brandId: string,
    userId: string,
    dto: GenerateImageDto,
  ): Promise<AdminFleetGenerationJob> {
    const persona = await this.characterService.requirePersonaBySlug(
      dto.personaSlug,
      organizationId,
    );

    const loraPath = dto.lora || undefined;

    const ingredient = await this.ingredientsService.create({
      brand: ObjectIdUtil.toObjectId(brandId)!,
      category: 'image',
      ...AdminFleetValueReader.getDefaultFleetModerationState(),
      generationError: undefined,
      generationProgress: 5,
      generationPrompt: dto.prompt,
      generationSource: dto.model || MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
      generationStage: 'queued',
      generationStartedAt: new Date(),
      loraUsed: loraPath,
      modelUsed: dto.model || MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
      negativePrompt: dto.negativePrompt,
      organization: ObjectIdUtil.toObjectId(organizationId)!,
      persona: persona._id,
      personaSlug: dto.personaSlug,
      status: IngredientStatus.PROCESSING,
      user: ObjectIdUtil.toObjectId(userId)!,
    } as Parameters<IngredientsService['create']>[0]);

    void this.processGenerationJob(
      ingredient._id.toString(),
      organizationId,
      brandId,
      userId,
      {
        ...dto,
        lora: loraPath,
      },
    );

    return AdminFleetValueReader.mapIngredientToGenerationJob(ingredient);
  }

  async getGenerationJob(
    jobId: string,
    organizationId: string,
  ): Promise<AdminFleetGenerationJob> {
    const ingredient = await this.ingredientsService.findOne({
      _id: jobId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!ingredient) {
      throw new NotFoundException('Generation job', jobId);
    }

    return AdminFleetValueReader.mapIngredientToGenerationJob(ingredient);
  }

  private async updateGenerationJob(
    jobId: string,
    updates: Partial<AdminFleetGenerationJob>,
  ): Promise<void> {
    await this.ingredientsService.patch(jobId, {
      cdnUrl: updates.cdnUrl,
      generationCompletedAt:
        updates.status === 'completed' || updates.status === 'failed'
          ? new Date()
          : undefined,
      generationError: updates.error,
      generationProgress: updates.progress,
      generationStage: updates.stage,
      status: AdminFleetValueReader.ingredientStatusForJobState(updates.status),
    });
  }

  private async processGenerationJob(
    jobId: string,
    organizationId: string,
    brandId: string,
    userId: string,
    dto: GenerateImageDto,
  ): Promise<void> {
    await this.updateGenerationJob(jobId, {
      progress: 15,
      stage: 'validating inputs',
      status: 'processing',
    });

    let pulseProgress = 20;
    const pulse = setInterval(() => {
      pulseProgress = Math.min(pulseProgress + 7, 82);
      void this.updateGenerationJob(jobId, {
        progress: pulseProgress,
        stage: 'running on ComfyUI',
        status: 'processing',
      });
    }, 2000);

    try {
      const ingredient = await this.generateImage(
        organizationId,
        brandId,
        userId,
        dto.personaSlug,
        dto.prompt,
        {
          cfgScale: dto.cfgScale,
          ingredientId: jobId,
          lora: dto.lora,
          model: dto.model,
          negativePrompt: dto.negativePrompt,
          seed: dto.seed,
          steps: dto.steps,
          ...AdminFleetValueReader.getDimensionsFromAspectRatio(
            dto.aspectRatio,
          ),
        },
      );

      clearInterval(pulse);
      await this.updateGenerationJob(jobId, {
        cdnUrl: ingredient.cdnUrl ?? undefined,
        ingredientId: ingredient._id.toString(),
        progress: 100,
        stage: 'completed',
        status: 'completed',
      });
    } catch (error: unknown) {
      clearInterval(pulse);
      await this.updateGenerationJob(jobId, {
        error: getErrorMessage(error),
        progress: 100,
        stage: 'failed',
        status: 'failed',
      });
    }
  }
}
