import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WorkflowNodeContinuationCoordinatorService } from '@api/collections/workflows/services/workflow-node-continuation-coordinator.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class HeygenWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly clipLibraryLinkService: ClipLibraryLinkService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly microservicesService: MicroservicesService,
    private readonly webhooksService: WebhooksService,
    private readonly continuationCoordinator: WorkflowNodeContinuationCoordinatorService,
    private readonly continuations: WorkflowNodeContinuationService,
  ) {}

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  async handleCallback(body: HeygenWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Webhook body is required');
    }

    this.loggerService.log(`${url} started`, { body });

    try {
      const { event_data, event_type } = body;
      const callbackId = this.getCallbackId(body);

      await this.microservicesService.notifyWebhook(
        'heygen',
        event_type || 'unknown',
        {
          ...body,
          metadata: {
            callbackId,
            timestamp: new Date().toISOString(),
          },
        },
      );

      if (!callbackId) {
        this.loggerService.warn(`${url} no callback_id provided`);
        return;
      }

      const clipResult = await this.clipResultsService.findOne({
        id: callbackId,
      });

      if (clipResult) {
        const projectId = this.readString(clipResult.projectId);

        if (!projectId) {
          this.loggerService.warn(`${url} clip result missing project id`, {
            callbackId,
          });
          return;
        }

        await this.handleClipResultCallback(
          projectId,
          callbackId,
          body,
          this.readString(clipResult.organizationId),
        );
        return;
      }

      let metadata = await this.metadataService.findOne({
        id: callbackId,
      });
      let ingredient = await this.ingredientsService.findOne({
        id: callbackId,
      });

      if (!metadata && ingredient?.metadataId) {
        metadata = await this.metadataService.findOne({
          id: ingredient.metadataId,
        });
      }

      if (!ingredient && metadata?.id) {
        ingredient = await this.ingredientsService.findOne({
          metadataId: metadata.id,
        });
      }

      if (!metadata || !ingredient) {
        this.loggerService.warn(`${url} callback target not found`, {
          callbackId,
          hasIngredient: Boolean(ingredient),
          hasMetadata: Boolean(metadata),
        });
        return;
      }

      const updateData: Partial<Record<string, unknown>> = {
        result: JSON.stringify(event_data),
      };

      const successVideoUrl = this.getSuccessVideoUrl(body);
      const providerVideoId = body.event_data?.video_id;
      const organizationId = this.readString(ingredient.organizationId);
      if (organizationId) {
        const continuation =
          await this.continuations.findIngredientCallbackTarget({
            ingredientId: ingredient.id.toString(),
            organizationId,
            provider: 'heygen',
          });
        if (
          continuation?.externalId &&
          providerVideoId &&
          continuation.externalId !== providerVideoId
        ) {
          throw new Error(
            `HeyGen callback ${providerVideoId} does not own ingredient ${ingredient.id}`,
          );
        }
      }

      if (successVideoUrl) {
        updateData.result = successVideoUrl;
      }
      if (providerVideoId) {
        updateData.externalId = providerVideoId;
      }

      if (this.isFailureEvent(event_type)) {
        updateData.error = JSON.stringify(event_data);
        await this.webhooksService.handleFailedGenerationForIngredient(
          ingredient.id.toString(),
          JSON.stringify(event_data),
        );
      } else if (event_type === 'avatar_video.success' && successVideoUrl) {
        await this.webhooksService.processMediaForIngredient(
          ingredient.id.toString(),
          'avatar',
          successVideoUrl,
          providerVideoId,
        );
      }

      await this.metadataService.patch(metadata.id, updateData);

      if (organizationId && this.isFailureEvent(event_type)) {
        await this.continuationCoordinator.failProviderAction({
          error: JSON.stringify(event_data),
          identity: {
            ingredientId: ingredient.id.toString(),
            organizationId,
          },
          provider: 'heygen',
          providerResult: {
            ...(providerVideoId ? { externalId: providerVideoId } : {}),
          },
        });
      } else if (
        organizationId &&
        event_type === 'avatar_video.success' &&
        successVideoUrl
      ) {
        await this.continuationCoordinator.completeProviderAction({
          identity: {
            ingredientId: ingredient.id.toString(),
            organizationId,
          },
          provider: 'heygen',
          providerResult: {
            ...(providerVideoId ? { externalId: providerVideoId } : {}),
            url: successVideoUrl,
          },
        });
      }

      this.loggerService.log(`${url} completed`, {
        callbackId,
        event_type,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private getCallbackId(body: HeygenWebhookPayload): string | undefined {
    return body.callback_id || body.event_data?.callback_id;
  }

  private getSuccessVideoUrl(body: HeygenWebhookPayload): string | undefined {
    if (!body.event_data) {
      return undefined;
    }

    return body.event_data.url || body.event_data.video_url;
  }

  private isFailureEvent(eventType?: string): boolean {
    return (
      eventType === 'avatar_video.failed' ||
      eventType === 'avatar_video.failure'
    );
  }

  private async handleClipResultCallback(
    projectId: string,
    clipResultId: string,
    body: HeygenWebhookPayload,
    organizationId?: string,
  ): Promise<void> {
    const videoUrl = this.getSuccessVideoUrl(body);
    const providerJobId = body.event_data?.video_id;

    if (videoUrl) {
      await this.clipResultsService.patch(clipResultId, {
        providerJobId,
        status: 'completed',
        videoUrl,
      });
      if (organizationId) {
        await this.clipLibraryLinkService.linkReadyClip({
          clipResultId,
          organizationId,
        });
      }
    } else if (this.isFailureEvent(body.event_type)) {
      await this.clipResultsService.patch(clipResultId, {
        providerJobId,
        status: 'failed',
      });
    } else {
      this.loggerService.log(
        `${this.constructorName}.handleClipResultCallback ignoring non-terminal event`,
        {
          clipResultId,
          eventType: body.event_type,
        },
      );
      return;
    }

    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      organizationId,
    );
  }
}
