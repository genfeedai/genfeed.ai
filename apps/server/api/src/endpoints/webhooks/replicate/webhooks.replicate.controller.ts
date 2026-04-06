import type { AssetsService } from '@api/collections/assets/services/assets.service';
import type { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import type { ConfigService } from '@api/config/config.service';
import type { ReplicateWebhookService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.service';
import type { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ReplicateStatus } from '@api/services/integrations/replicate/helpers/replicate.enum';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { supportsMultipleOutputs } from '@genfeedai/constants';
import {
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
  TrainingStatus,
} from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { validateWebhook } from 'replicate';

@AutoSwagger()
@Public()
@Controller('webhooks/replicate')
export class ReplicateWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly modelsService: ModelsService,
    readonly _replicateWebhookService: ReplicateWebhookService,
    private readonly webhooksService: WebhooksService,
    private readonly trainingsService: TrainingsService,
    private readonly assetsService: AssetsService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly modelRegistrationService: ModelRegistrationService,
  ) {}

  /**
   * Validates the webhook signature from Replicate.
   * This must be synchronous and fail fast if invalid.
   */
  private async validateWebhookSignature(
    request: Request,
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} received`, payload);

    const secret = this.configService.get('REPLICATE_WEBHOOK_SIGNING_SECRET');

    // If signing secret is set and we're in production, validate webhook.
    // Otherwise, skip validation but continue processing.
    if (secret && this.configService.isProduction) {
      const requestData = {
        body: request.body,
        id: request.headers['webhook-id'] as string,
        secret,
        signature: request.headers['webhook-signature'] as string,
        timestamp: request.headers['webhook-timestamp'] as string,
      };

      const isWebhookValid = await validateWebhook(requestData);

      if (!isWebhookValid) {
        throw new HttpException('Webhook is invalid', HttpStatus.UNAUTHORIZED);
      }
    } else {
      this.loggerService.warn(
        `${url} validation skipped (missing secret or non-production environment)`,
      );
    }

    this.loggerService.log(`${url} webhook validated`, payload);
  }

  /**
   * Processes the webhook payload asynchronously.
   * This includes all database operations, S3 uploads, and notifications.
   */
  private async processWebhookAsync(
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Prefer checking by externalId first: if a training exists for this id, handle training flow
      const existingTraining = await this.trainingsService.findOne({
        externalId: payload.id,
      });

      if (existingTraining) {
        const training = existingTraining;

        if (training) {
          if (
            payload.status === (ReplicateStatus.COMPLETED as string) ||
            payload.status === (ReplicateStatus.SUCCEEDED as string)
          ) {
            // Prefer trained model URL from output.version when present
            const trainedModelVersion =
              (payload?.output as Record<string, string>)?.version ||
              payload?.version;

            // Update training with completed status and model URL
            const updatedTraining = await this.trainingsService.patch(
              training._id,
              {
                model: trainedModelVersion,
                status: TrainingStatus.COMPLETED,
              },
            );

            // Publish websocket event for training completion
            await this.websocketService.publishTrainingStatus(
              String(training._id),
              IngredientStatus.GENERATED,
              String(training.user),
              {
                externalId: payload.id,
                model: trainedModelVersion,
                status: TrainingStatus.COMPLETED,
                training: updatedTraining,
              },
            );

            // Register trained model in the model registry
            try {
              if (updatedTraining) {
                await this.modelRegistrationService.createFromTraining(
                  updatedTraining,
                );
              }
            } catch (err: unknown) {
              // Non-fatal: reconciliation job will retry
              this.loggerService.error(
                `Failed to register model from training ${training._id}: ${(err as Error).message}`,
              );
            }

            this.loggerService.log(`Training completed successfully`, {
              externalId: payload.id,
              model: trainedModelVersion,
            });
          } else if (
            payload.status === (ReplicateStatus.FAILED as string) ||
            payload.status === (ReplicateStatus.ERROR as string)
          ) {
            // Update training with failed status
            await this.trainingsService.patch(training._id, {
              status: TrainingStatus.FAILED,
            });

            // Publish websocket event for training failure
            await this.websocketService.publishTrainingStatus(
              String(training._id),
              IngredientStatus.FAILED,
              String(training.user),
              {
                error: payload.error || 'Training failed',
                externalId: payload.id,
                status: TrainingStatus.FAILED,
              },
            );

            // Helpful diagnostics for malformed training URL inputs
            try {
              const inputImages = (payload?.input as Record<string, string>)
                ?.input_images as string | undefined;

              const hasDoubleScheme =
                typeof inputImages === 'string' &&
                inputImages.startsWith('https://https://');

              this.loggerService.error(`Training failed`, {
                error: payload.error,
                externalId: payload.id,
                hint: hasDoubleScheme
                  ? 'Detected malformed input_images URL (double https). Consider retry with corrected URL.'
                  : undefined,
                inputImages,
              });
            } catch (error: unknown) {
              this.loggerService.warn(`Training not found for webhook`, {
                error,
                externalId: payload.id,
              });
            }
          }
        } else {
          this.loggerService.warn(`Training not found for webhook`, {
            externalId: payload.id,
          });
        }
      } else if (
        (payload.status === (ReplicateStatus.COMPLETED as string) ||
          payload.status === (ReplicateStatus.SUCCEEDED as string)) &&
        payload.model
      ) {
        // Check if this is an asset generation first
        const asset = await this.assetsService.findOne({
          externalId: payload.id,
          isDeleted: false,
        });

        if (asset) {
          // This is an asset generation (banner/logo)
          const output = payload.output;
          const imageUrl =
            typeof output === 'string'
              ? output
              : Array.isArray(output) && output.length > 0
                ? output[0]
                : null;

          if (imageUrl && typeof imageUrl === 'string') {
            await this.webhooksService.processAssetFromWebhook(
              'replicate',
              asset._id,
              imageUrl,
            );
          } else {
            this.loggerService.warn(
              'Replicate webhook: no output URL for asset',
              {
                assetId: asset._id,
                predictionId: payload.id,
                status: payload.status,
              },
            );
          }
        } else {
          // This is a regular media generation webhook (ingredient)
          // Look up the model in the database to get its category
          const model = await this.modelsService.findOne({
            isDeleted: false,
            key: payload.model,
          });

          // Map ModelCategory to IngredientCategory
          let ingredientCategory: IngredientCategory;
          if (model?.category) {
            switch (model.category) {
              case ModelCategory.VIDEO:
                ingredientCategory = IngredientCategory.VIDEO;
                break;
              case ModelCategory.MUSIC:
                ingredientCategory = IngredientCategory.MUSIC;
                break;
              default:
                ingredientCategory = IngredientCategory.IMAGE;
                break;
            }
          } else {
            // Fallback: if model not found in DB, default to IMAGE
            this.loggerService.warn(
              `Model not found in database, defaulting to IMAGE category`,
              { modelKey: payload.model },
            );
            ingredientCategory = IngredientCategory.IMAGE;
          }

          const output = payload.output;

          // Check if the model supports multiple outputs
          // Extract model key from payload (format: "owner/model-name" or ModelKey)
          // @ts-expect-error TS2339
          const extractedModelKey = payload.model?.split('/').pop() || '';
          const modelSupportsMultiOutputs =
            supportsMultipleOutputs(extractedModelKey);

          if (Array.isArray(output)) {
            const uploadTasks = output
              .map((url, index) => {
                if (typeof url !== 'string') {
                  return null;
                }

                const externalId =
                  modelSupportsMultiOutputs && output.length > 1
                    ? `${payload.id}_${index}`
                    : payload.id;

                return this.webhooksService.processMediaFromWebhook(
                  'replicate',
                  ingredientCategory,
                  externalId,
                  url,
                );
              })
              .filter((task): task is Promise<void> => Boolean(task));

            if (uploadTasks.length > 0) {
              const uploadResults = await Promise.allSettled(uploadTasks);
              uploadResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                  this.loggerService.error(
                    'Replicate webhook: failed to process output',
                    {
                      error: result.reason,
                      index,
                      predictionId: payload.id,
                    },
                  );
                }
              });
            } else {
              this.loggerService.warn(
                'Replicate webhook: output array contained no URLs',
                { model: payload.model, predictionId: payload.id },
              );
            }
          } else if (typeof output === 'string') {
            await this.webhooksService.processMediaFromWebhook(
              'replicate',
              ingredientCategory,
              payload.id,
              output,
            );
          } else {
            // No direct URL(s) available — log and skip
            this.loggerService.warn(
              'Replicate webhook: no output URLs to process',
              {
                hasOutput: !!output,
                id: payload.id,
                model: payload.model,
                status: payload.status,
              },
            );
          }
        }
      } else if (
        payload.status === (ReplicateStatus.FAILED as string) ||
        payload.status === (ReplicateStatus.ERROR as string)
      ) {
        // Check if this is a failed asset generation first
        const asset = await this.assetsService.findOne({
          externalId: payload.id,
          isDeleted: false,
        });

        if (asset) {
          this.loggerService.error(
            'Replicate webhook: asset generation failed',
            {
              assetId: asset._id,
              error: payload.error,
              predictionId: payload.id,
            },
          );

          // Mark asset as deleted to indicate failure
          await this.assetsService.patch(String(asset._id), {
            isDeleted: true,
          });

          // Notify user via websocket
          const userId = String(asset.user);
          if (userId) {
            await this.websocketService.publishAssetStatus(
              String(asset._id),
              'failed',
              userId,
              {
                assetId: String(asset._id),
                category: asset.category,
                error: payload.error || 'Asset generation failed',
                predictionId: payload.id,
              },
            );
          }
        } else {
          // Handle failed generation with error message for ingredients
          await this.webhooksService.handleFailedGeneration(
            payload.id,
            // @ts-expect-error TS2345
            payload.error || 'Generation failed',
          );
        }
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      // Don't re-throw - webhook response already sent
      // Errors are logged but don't affect the HTTP response
      // The error is already caught and logged in handleCallback's setImmediate callback
    }
  }

  @HttpCode(200)
  @Post('callback')
  async handleCallback(
    @Req() request: Request,
    @Body() payload: ReplicateWebhookPayload,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Step 1: Validate webhook signature (synchronous, required)
      await this.validateWebhookSignature(request, payload);

      // Step 2: Return success response immediately
      // Step 3: Process webhook payload asynchronously after response is sent
      setImmediate(() => {
        this.processWebhookAsync(payload).catch((error: unknown) => {
          this.loggerService.error(`${url} async processing failed`, {
            error,
            payloadId: payload.id,
            status: payload.status,
          });
        });
      });

      return { detail: 'Webhook processed' };
    } catch (error: unknown) {
      // Only throw errors during validation - processing errors are handled async
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
