import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

interface MetadataUpdateData {
  result?: string;
  error?: string;
}

@Injectable()
export class ReplicateWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly microservicesService: MicroservicesService,
  ) {}

  async handleCallback(body: ReplicateWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { body });

    try {
      const { id, status, output, error, webhook_metadata } = body;

      // Extract metadata ID from webhook_metadata if present
      // @ts-expect-error TS2339
      const metadataId = webhook_metadata?.metadataId;

      // Send immediate notification that we received the webhook
      this.microservicesService
        .notifyWebhook('replicate', status, {
          ...body,
          metadata: {
            metadataId,
            predictionId: id,
            timestamp: new Date().toISOString(),
          },
        })
        .catch((notifyError: unknown) => {
          this.loggerService.warn(
            `${url} failed to forward webhook notification`,
            notifyError,
          );
        });

      if (!id) {
        this.loggerService.warn(`${url} no prediction id provided`);
        return;
      }

      if (!metadataId) {
        this.loggerService.warn(`${url} no metadataId in webhook_metadata`);
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
      const updateData: MetadataUpdateData = {};

      if (status === 'succeeded' && output) {
        // Extract the URL from output (handles string, array, or object)
        const fileUrl = this.extractOutputUrl(output);
        updateData.result = fileUrl ?? JSON.stringify(output);

        // Log file upload processing if we have a valid URL
        if (fileUrl?.startsWith('http')) {
          this.loggerService.log(
            `${url} processing file upload for ${fileUrl}`,
          );
        }
      }

      if (error) {
        updateData.error =
          typeof error === 'string' ? error : JSON.stringify(error);
      }

      await this.metadataService.patch(metadata._id, updateData);

      this.loggerService.log(`${url} completed`, {
        metadataId,
        predictionId: id,
        status,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Extract URL from Replicate output (handles string, array, or object)
   */
  private extractOutputUrl(output: unknown): string | null {
    if (typeof output === 'string') {
      return output;
    }
    if (Array.isArray(output) && output.length > 0) {
      return typeof output[0] === 'string' ? output[0] : null;
    }
    return null;
  }
}
