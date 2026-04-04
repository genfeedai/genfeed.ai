import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { LeonardoAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LeonardoaiWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
  ) {}

  async handleCallback(body: LeonardoAIWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { body });

    const { generationId, status, images, customId } = body;

    if (!generationId) {
      this.loggerService.warn(`${url} no generationId provided`);
      return;
    }

    // Extract metadata ID from customId if present
    const metadataId = customId;

    if (!metadataId) {
      this.loggerService.warn(`${url} no customId provided`);
      return;
    }

    // Get metadata for this callback
    const metadata = await this.metadataService.findOne({
      _id: metadataId,
      isDeleted: false,
    });
    if (!metadata) {
      this.loggerService.warn(`${url} metadata not found`, { metadataId });
      return;
    }

    // Update metadata with callback response
    const updateData: Partial<Record<string, unknown>> = {};

    // @ts-expect-error TS2339
    if (status === 'COMPLETE' && images && images.length > 0) {
      // Store the first image URL as result
      // @ts-expect-error TS7053
      updateData.result = images[0].url || JSON.stringify(images);
    }

    if (status === 'FAILED') {
      updateData.error = 'Image generation failed';
    }

    await this.metadataService.patch(metadata._id, updateData);

    this.loggerService.log(`${url} completed`, {
      generationId,
      metadataId,
      status,
    });
  }
}
