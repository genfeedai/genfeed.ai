import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ReplicateWebhookPayloadDto } from '@api/endpoints/webhooks/dto/replicate-webhook-payload.dto';
import { ReplicateGenerationWebhookHandler } from '@api/endpoints/webhooks/replicate/handlers/replicate-generation-webhook.handler';
import { ReplicateWebhookService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.service';
import { ReplicateWebhookVerificationService } from '@api/endpoints/webhooks/replicate/webhooks.replicate.verification.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ReplicateStatus } from '@api/services/integrations/replicate/helpers/replicate.enum';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { IngredientStatus, TrainingStatus } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
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
    readonly _replicateWebhookService: ReplicateWebhookService,
    private readonly trainingsService: TrainingsService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly generationWebhookHandler: ReplicateGenerationWebhookHandler,
    private readonly verificationService: ReplicateWebhookVerificationService,
  ) {}

  /**
   * Validates the webhook signature from Replicate.
   * Fails closed when the signing secret is missing — an unauthenticated
   * public endpoint must not accept callbacks it cannot authenticate.
   */
  private async validateWebhookSignature(
    request: Request,
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} received`, payload);

    const secret = this.configService.get('REPLICATE_WEBHOOK_SIGNING_SECRET') as
      | string
      | undefined;

    // Blank counts as unset (same fail-closed contract as assertWebhookToken).
    if (!secret?.trim()) {
      this.loggerService.error(
        `${url} webhook rejected — REPLICATE_WEBHOOK_SIGNING_SECRET is not configured. Set it so Replicate callbacks can be authenticated.`,
      );
      throw new HttpException('Webhook is invalid', HttpStatus.UNAUTHORIZED);
    }

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

    this.loggerService.log(`${url} webhook validated`, payload);
  }

  /**
   * Processes the webhook payload asynchronously.
   * This includes all database operations, S3 uploads, and notifications.
   */
  private async processWebhookAsync(
    signedPayload: ReplicateWebhookPayload,
    workflowContinuationId?: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // A valid signature is not proof of origin here: Replicate's signing key
      // is account-scoped and cannot be rotated, so status and output are
      // re-derived from Replicate's own record before anything acts on them.
      const payload =
        await this.verificationService.resolveTrustedPayload(signedPayload);

      if (!payload) {
        await this.verificationService.deferUntrustedDelivery(signedPayload);
        return;
      }

      // Prefer checking by externalId first: if a training exists for this id, handle training flow
      const existingTraining = await this.trainingsService.findOne({
        externalId: payload.id,
      });

      if (existingTraining) {
        await this.handleTrainingWebhook(existingTraining, payload);
      } else if (
        (payload.status === (ReplicateStatus.COMPLETED as string) ||
          payload.status === (ReplicateStatus.SUCCEEDED as string)) &&
        payload.model
      ) {
        await this.generationWebhookHandler.handleCompleted(
          payload,
          workflowContinuationId,
        );
      } else if (
        payload.status === (ReplicateStatus.FAILED as string) ||
        payload.status === (ReplicateStatus.ERROR as string)
      ) {
        await this.generationWebhookHandler.handleFailed(
          payload,
          workflowContinuationId,
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      // Don't re-throw - webhook response already sent
      // Errors are logged but don't affect the HTTP response
      // The error is already caught and logged in handleCallback's setImmediate callback
    }
  }

  /**
   * Handles a webhook callback that matches an existing training record.
   */
  private async handleTrainingWebhook(
    existingTraining: TrainingDocument,
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    const training = existingTraining;

    if (!training) {
      this.loggerService.warn(`Training not found for webhook`, {
        externalId: payload.id,
      });
      return;
    }

    if (
      payload.status === (ReplicateStatus.COMPLETED as string) ||
      payload.status === (ReplicateStatus.SUCCEEDED as string)
    ) {
      await this.handleTrainingCompleted(training, payload);
    } else if (
      payload.status === (ReplicateStatus.FAILED as string) ||
      payload.status === (ReplicateStatus.ERROR as string)
    ) {
      await this.handleTrainingFailed(training, payload);
    }
  }

  /**
   * Marks a training as completed, registers the trained model, and
   * publishes the completion event.
   */
  private async handleTrainingCompleted(
    training: TrainingDocument,
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    // Prefer trained model URL from output.version when present
    const trainedModelVersion =
      (payload?.output as Record<string, string>)?.version || payload?.version;
    const trainingConfig =
      training.config &&
      typeof training.config === 'object' &&
      !Array.isArray(training.config)
        ? (training.config as Record<string, unknown>)
        : {};

    // Update training with completed status and model URL
    const updatedTraining = await this.trainingsService.patch(training.id, {
      config: {
        ...trainingConfig,
        model: trainedModelVersion,
        status: TrainingStatus.COMPLETED,
        trainedModelVersion,
      },
      stage: 'READY',
    });

    // Publish websocket event for training completion
    await this.websocketService.publishTrainingStatus(
      String(training.id),
      IngredientStatus.GENERATED,
      training.userId,
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
        await this.modelRegistrationService.createFromTraining(updatedTraining);
      }
    } catch (err: unknown) {
      // Non-fatal: reconciliation job will retry
      this.loggerService.error(
        `Failed to register model from training ${training.id}: ${(err as Error).message}`,
      );
    }

    this.loggerService.log(`Training completed successfully`, {
      externalId: payload.id,
      model: trainedModelVersion,
    });
  }

  /**
   * Marks a training as failed, publishes the failure event, and logs
   * diagnostics for common malformed-input cases.
   */
  private async handleTrainingFailed(
    training: TrainingDocument,
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    // Update training with failed status
    const trainingConfig =
      training.config &&
      typeof training.config === 'object' &&
      !Array.isArray(training.config)
        ? (training.config as Record<string, unknown>)
        : {};
    await this.trainingsService.patch(training.id, {
      config: {
        ...trainingConfig,
        error: payload.error || 'Training failed',
        status: TrainingStatus.FAILED,
      },
      stage: 'FAILED',
    });

    // Publish websocket event for training failure
    await this.websocketService.publishTrainingStatus(
      String(training.id),
      IngredientStatus.FAILED,
      training.userId,
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

  @HttpCode(200)
  @Post('callback')
  async handleCallback(
    @Req() request: Request,
    @Body() payload: ReplicateWebhookPayloadDto,
    @Query('workflowContinuationId') workflowContinuationId?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Step 1: Validate webhook signature (synchronous, required)
      await this.validateWebhookSignature(request, payload);

      // Step 2: Suppress replays of an already-handled delivery. Must run
      // before the 200, otherwise a captured callback replayed concurrently
      // would be processed twice.
      const isReplay = await this.verificationService.isReplay(
        request.headers['webhook-id'],
      );

      if (isReplay) {
        return { detail: 'Webhook already processed' };
      }

      // Step 3: Return success response immediately
      // Step 4: Process webhook payload asynchronously after response is sent
      setImmediate(() => {
        this.processWebhookAsync(payload, workflowContinuationId).catch(
          (error: unknown) => {
            this.loggerService.error(`${url} async processing failed`, {
              error,
              payloadId: payload.id,
              status: payload.status,
            });
          },
        );
      });

      return { detail: 'Webhook processed' };
    } catch (error: unknown) {
      // Only throw errors during validation - processing errors are handled async
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
