import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { WebhookJobData } from '@api/services/webhook-client/webhook-client-job.interface';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class WebhookClientService {
  private readonly constructorName = 'WebhookClientService';

  constructor(
    @InjectQueue('webhook-client') private readonly webhookQueue: Queue,
    private readonly logger: LoggerService,
    private readonly organizationSettingsService: OrganizationSettingsService,
  ) {}

  /**
   * Queue webhook notification when an ingredient (image or video) is generated
   */
  async sendIngredientWebhook(
    organizationId: string,
    ingredient: IngredientEntity,
    metadata?: MetadataEntity | null,
  ): Promise<void> {
    try {
      // Fetch organization settings
      const settings = await this.organizationSettingsService.findOne({
        organization: organizationId,
      });

      if (
        !settings ||
        !settings.isWebhookEnabled ||
        !settings.webhookEndpoint
      ) {
        this.logger.log(
          `${this.constructorName} webhooks not enabled or endpoint not configured`,
          { organizationId },
        );
        return;
      }

      if (!settings.webhookSecret) {
        this.logger.warn(
          `${this.constructorName} webhook secret not configured`,
          { organizationId },
        );
        return;
      }

      // Serialize ingredient
      const serializedIngredient = IngredientSerializer.serialize(ingredient);

      // Build payload
      const payload = {
        event: 'ingredient.generated',
        ingredient: serializedIngredient.data || serializedIngredient,
        metadata: metadata
          ? {
              duration: metadata.duration,
              extension: metadata.extension,
              externalProvider: metadata.externalProvider,
              height: metadata.height,
              model: metadata.model,
              size: metadata.size,
              width: metadata.width,
            }
          : null,
        timestamp: new Date().toISOString(),
      };

      const jobData: WebhookJobData = {
        endpoint: settings.webhookEndpoint,
        ingredientId: ingredient._id,
        organizationId,
        payload,
        secret: settings.webhookSecret,
      };

      // Add job to queue
      const job = await this.webhookQueue.add('send-webhook', jobData, {
        jobId: `webhook-${organizationId}-${ingredient._id}-${Date.now()}`,
      });

      this.logger.log(`${this.constructorName} webhook job queued`, {
        event: payload.event,
        ingredientId: ingredient._id,
        jobId: job.id,
        organizationId,
      });
    } catch (error: unknown) {
      // Log failure but don't throw - webhook failures shouldn't break the flow
      this.logger.error(`${this.constructorName} failed to queue webhook`, {
        error: (error as Error)?.message,
        ingredientId: ingredient._id,
        organizationId,
      });
    }
  }

  /**
   * Queue a generic webhook event
   */
  async sendWebhook(
    organizationId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const settings = await this.organizationSettingsService.findOne({
        organization: organizationId,
      });

      if (
        !settings ||
        !settings.isWebhookEnabled ||
        !settings.webhookEndpoint ||
        !settings.webhookSecret
      ) {
        return;
      }

      const payload = {
        event,
        timestamp: new Date().toISOString(),
        ...data,
      };

      const jobData: WebhookJobData = {
        endpoint: settings.webhookEndpoint,
        organizationId,
        payload,
        secret: settings.webhookSecret,
      };

      await this.webhookQueue.add('send-webhook', jobData, {
        jobId: `webhook-${organizationId}-${event}-${Date.now()}`,
      });

      this.logger.log(`${this.constructorName} webhook job queued`, {
        event,
        organizationId,
      });
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed to queue webhook`, {
        error: (error as Error)?.message,
        event,
        organizationId,
      });
    }
  }
}
