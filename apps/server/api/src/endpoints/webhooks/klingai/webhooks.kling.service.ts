import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { getErrorMessage } from '@api/helpers/utils/error/get-error-message.util';
import { KlingAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type MediaUrls = {
  videoUrls: string[];
  imageUrls: string[];
};

@Injectable()
export class KlingWebhookService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
  ) {}

  /**
   * Expose media URL extraction so controllers can reuse the logic
   */
  public extractMediaUrls(taskResult: unknown): MediaUrls {
    const videoUrls = new Set<string>();
    const imageUrls = new Set<string>();

    const visit = (value: unknown, key?: string) => {
      if (value == null) {
        return;
      }

      if (typeof value === 'string') {
        const normalized = value.trim();
        if (!normalized || !this.isHttpUrl(normalized)) {
          return;
        }

        const mediaType = this.inferMediaType(normalized, key);
        if (mediaType === 'image') {
          imageUrls.add(normalized);
        } else if (mediaType === 'video') {
          videoUrls.add(normalized);
        } else {
          // If we cannot infer the type, default to video since Kling callbacks
          // are primarily used for video generations.
          videoUrls.add(normalized);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, key));
        return;
      }

      if (typeof value === 'object') {
        Object.entries(value as Record<string, unknown>).forEach(
          ([childKey, childValue]) => {
            const compositeKey = key ? `${key}.${childKey}` : childKey;
            visit(childValue, compositeKey);
          },
        );
      }
    };

    visit(taskResult);

    return {
      imageUrls: Array.from(imageUrls),
      videoUrls: Array.from(videoUrls),
    };
  }

  async handleCallback(body: KlingAIWebhookPayload) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { body });

    try {
      const { task_id, task_status, task_result, custom_id } = body;

      if (!task_id) {
        this.loggerService.warn(`${url} no task_id provided`);
        return;
      }

      // Extract metadata ID from custom_id if present
      const metadataId = custom_id;

      if (!metadataId) {
        this.loggerService.warn(`${url} no custom_id provided`);
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
      const updateData: Record<string, unknown> = {};

      if (task_status === 'succeed' && task_result) {
        const { videoUrls } = this.extractMediaUrls(task_result);
        if (videoUrls.length > 0) {
          updateData.result = videoUrls[0];
        } else if (
          typeof task_result === 'string' &&
          this.isHttpUrl(task_result)
        ) {
          updateData.result = task_result;
        } else {
          updateData.result = JSON.stringify(task_result);
        }

        // Successful callbacks should clear previous errors
        updateData.error = null;
      }

      if (task_status === 'failed') {
        updateData.error = getErrorMessage(task_result) || 'Task failed';
      }

      if (Object.keys(updateData).length > 0) {
        await this.metadataService.patch(metadata._id, updateData);
      }

      this.loggerService.log(`${url} completed`, {
        metadataId,
        taskId: task_id,
        taskStatus: task_status,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private isHttpUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private inferMediaType(url: string, key?: string): 'video' | 'image' | null {
    const lowerKey = key?.toLowerCase() ?? '';
    const lowerUrl = url.toLowerCase();

    // Check key hints first
    if (lowerKey.includes('video')) {
      return 'video';
    }
    if (/image|thumbnail|cover/.test(lowerKey)) {
      return 'image';
    }

    // Fall back to file extension
    if (/\.(mp4|mov|webm|mkv|avi)(\?|$)/.test(lowerUrl)) {
      return 'video';
    }
    if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(lowerUrl)) {
      return 'image';
    }

    return null;
  }
}
