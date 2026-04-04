import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { OpusProWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OpusProWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly microservicesService: MicroservicesService,
  ) {}

  async handleCallback(body: OpusProWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { body });

    try {
      const { callback_id, status, videoUrl, video_url, error } = body;

      await this.microservicesService.notifyWebhook(
        'opuspro',
        status || 'unknown',
        {
          ...body,
          metadata: {
            callbackId: callback_id,
            timestamp: new Date().toISOString(),
          },
        },
      );

      if (!callback_id) {
        this.loggerService.warn(`${url} no callback_id provided`);
        return;
      }

      const metadata = await this.metadataService.findOne({
        _id: callback_id,
        isDeleted: false,
      });
      if (!metadata) {
        this.loggerService.warn(`${url} metadata not found`, { callback_id });
        return;
      }

      const updateData: Record<string, unknown> = {};
      const resolvedVideoUrl = videoUrl || video_url;

      if (status === 'completed' && resolvedVideoUrl) {
        updateData.result = resolvedVideoUrl;
        updateData.error = null;
      }

      if (status === 'failed') {
        updateData.error = error || 'Opus Pro generation failed';
      }

      if (Object.keys(updateData).length > 0) {
        await this.metadataService.patch(metadata._id, updateData);
      }

      this.loggerService.log(`${url} completed`, {
        callback_id,
        status,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  extractVideoUrl(payload: OpusProWebhookPayload): string | undefined {
    return payload.videoUrl || payload.video_url || undefined;
  }
}
