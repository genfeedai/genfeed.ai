import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { HeygenWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HeygenWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly microservicesService: MicroservicesService,
    private readonly webhooksService: WebhooksService,
  ) {}

  async handleCallback(body: HeygenWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
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
        _id: callbackId,
        isDeleted: false,
      });

      if (clipResult) {
        await this.handleClipResultCallback(
          clipResult.project.toString(),
          callbackId,
          body,
        );
        return;
      }

      let metadata = await this.metadataService.findOne({
        _id: callbackId,
        isDeleted: false,
      });
      let ingredient = await this.ingredientsService.findOne({
        _id: callbackId,
        isDeleted: false,
      });

      if (!metadata && ingredient?.metadata) {
        metadata = await this.metadataService.findOne({
          _id: ingredient.metadata,
          isDeleted: false,
        });
      }

      if (!ingredient && metadata?._id) {
        ingredient = await this.ingredientsService.findOne({
          isDeleted: false,
          metadata: metadata._id,
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

      if (successVideoUrl) {
        updateData.result = successVideoUrl;
      }
      if (providerVideoId) {
        updateData.externalId = providerVideoId;
      }

      if (this.isFailureEvent(event_type)) {
        updateData.error = JSON.stringify(event_data);
      } else if (event_type === 'avatar_video.success' && successVideoUrl) {
        await this.webhooksService.processMediaForIngredient(
          ingredient._id.toString(),
          'avatar',
          successVideoUrl,
          providerVideoId,
        );
      }

      await this.metadataService.patch(metadata._id, updateData);

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
  ): Promise<void> {
    const videoUrl = this.getSuccessVideoUrl(body);
    const providerJobId = body.event_data?.video_id;

    if (videoUrl) {
      await this.clipResultsService.patch(clipResultId, {
        providerJobId,
        status: 'completed',
        videoUrl,
      });
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

    const projectClipResults =
      await this.clipResultsService.findByProject(projectId);
    const hasPendingClipResults = projectClipResults.some(
      (clipResult) =>
        clipResult.status !== 'completed' && clipResult.status !== 'failed',
    );

    if (hasPendingClipResults) {
      return;
    }

    const hasCompletedClip = projectClipResults.some(
      (clipResult) => clipResult.status === 'completed',
    );

    if (hasCompletedClip) {
      await this.clipProjectsService.patch(projectId, {
        $set: {
          progress: 100,
          status: 'completed',
        },
        $unset: {
          error: '',
        },
      });
      return;
    }

    await this.clipProjectsService.patch(projectId, {
      error: 'All clip generations failed.',
      progress: 100,
      status: 'failed',
    });
  }
}
