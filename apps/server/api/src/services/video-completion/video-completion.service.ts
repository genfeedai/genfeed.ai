import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { IngredientStatus, Status } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type VideoCompletionEvent = {
  ingredientId: string;
  userId: string;
  organizationId: string;
  status: Status.COMPLETED | Status.FAILED;
  result?: {
    s3Key?: string;
    duration?: number;
    width?: number;
    height?: number;
    dimensions?: {
      width?: number;
      height?: number;
    };
    metadata?: {
      duration?: number;
      width?: number;
      height?: number;
    };
    [key: string]: unknown;
  };
  error?: string;
  timestamp: string;
};

@Injectable()
export class VideoCompletionService implements OnModuleInit {
  constructor(
    private readonly redisService: RedisService,
    private readonly ingredientsService: IngredientsService,
    private readonly metadataService: MetadataService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    await this.subscribeToVideoCompletion();
  }

  private async subscribeToVideoCompletion(): Promise<void> {
    await this.redisService.subscribe(
      'video-processing-complete',
      async (data: unknown) => {
        const event = data as VideoCompletionEvent;
        this.logger.log(
          `Received video completion event for ${event.ingredientId}`,
        );

        await this.handleVideoCompletion(event);
      },
    );
    this.logger.log('Subscribed to video-processing-complete channel');
  }

  private async handleVideoCompletion(data: VideoCompletionEvent) {
    try {
      const { ingredientId, organizationId, status, result, error } = data;

      if (status === Status.COMPLETED) {
        const ingredientUpdate: Record<string, unknown> = {
          status: IngredientStatus.GENERATED,
        };

        if (result?.s3Key) {
          ingredientUpdate.s3Key = result.s3Key;
        }

        await this.ingredientsService.patch(ingredientId, ingredientUpdate);

        this.logger.log(
          `Updated ingredient ${ingredientId} status to COMPLETED`,
        );

        if (result?.s3Key) {
          this.logger.log(`Video processed successfully: ${result.s3Key}`);
        }

        const metadataUpdate = this.extractMetadataUpdate(result);
        if (Object.keys(metadataUpdate).length > 0) {
          await this.patchIngredientMetadata(
            ingredientId,
            organizationId,
            metadataUpdate,
          );
        }
      } else if (status === Status.FAILED) {
        // Update ingredient status to failed
        await this.ingredientsService.patch(ingredientId, {
          status: IngredientStatus.FAILED,
        });

        this.logger.error(
          `Updated ingredient ${ingredientId} status to FAILED: ${error}`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to handle video completion for ${data.ingredientId}:`,
        error,
      );
    }
  }

  private extractMetadataUpdate(
    result?: VideoCompletionEvent['result'],
  ): Record<string, number> {
    if (!result) {
      return {};
    }

    const metadata = result.metadata ?? {};
    const dimensions = result.dimensions ?? {};

    const duration = this.getNumericValue(result.duration, metadata.duration);
    const width = this.getNumericValue(
      result.width,
      dimensions.width,
      metadata.width,
    );
    const height = this.getNumericValue(
      result.height,
      dimensions.height,
      metadata.height,
    );

    return {
      ...(duration !== undefined ? { duration } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
  }

  private getNumericValue(
    ...values: Array<number | undefined>
  ): number | undefined {
    return values.find((value) => typeof value === 'number');
  }

  private async patchIngredientMetadata(
    ingredientId: string,
    organizationId: string,
    metadataUpdate: Record<string, number>,
  ): Promise<void> {
    const ingredient = await this.ingredientsService.findOne({
      _id: ingredientId,
      isDeleted: false,
      organization: organizationId,
    });

    const metadataId =
      ingredient?.metadata && typeof ingredient.metadata === 'string'
        ? ingredient.metadata
        : ingredient?.metadata &&
            typeof ingredient.metadata === 'object' &&
            '_id' in ingredient.metadata
          ? String((ingredient.metadata as { _id: string })._id)
          : undefined;

    if (!metadataId) {
      this.logger.warn(
        `Metadata not found for completed ingredient ${ingredientId}`,
        metadataUpdate,
      );
      return;
    }

    await this.metadataService.patch(metadataId, metadataUpdate);
  }
}
