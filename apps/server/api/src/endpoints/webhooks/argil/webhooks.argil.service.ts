import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ArgilWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class ArgilWebhookService {
  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly loggerService: LoggerService,
  ) {}

  async handleCallback(body: ArgilWebhookPayload): Promise<void> {
    const videoId = this.readString(body.data?.videoId);
    const callbackId = this.readCallbackId(body.data?.extras);
    if (!videoId || !callbackId) {
      throw new BadRequestException(
        'Argil callback requires data.videoId and extras.callbackId',
      );
    }

    const clipResult = await this.clipResultsService.findOne({
      id: callbackId,
    });
    if (!clipResult) {
      this.loggerService.warn('ArgilWebhookService callback target not found', {
        callbackId,
        videoId,
      });
      return;
    }

    const record = clipResult as unknown as JsonRecord;
    const providerName = this.readString(record.providerName);
    const providerJobId = this.readString(record.providerJobId);
    if (
      providerName !== 'argil' ||
      (providerJobId !== undefined && providerJobId !== videoId)
    ) {
      throw new BadRequestException(
        'Argil callback does not match the stored provider job',
      );
    }

    const projectId = this.readString(record.projectId);
    if (!projectId) {
      throw new BadRequestException('Argil clip result is missing projectId');
    }

    const organizationId = this.readString(record.organizationId);
    const status = this.readString(record.status);
    if (status === 'completed' || status === 'failed') {
      this.loggerService.log('ArgilWebhookService terminal callback replay', {
        callbackId,
        status,
        videoId,
      });
      await this.clipProjectsService.reconcileTerminalState(
        projectId,
        organizationId,
      );
      return;
    }

    if (body.event === 'VIDEO_GENERATION_SUCCESS') {
      const videoUrl = this.readString(body.data?.videoUrl);
      if (!videoUrl) {
        throw new BadRequestException(
          'Successful Argil callback requires data.videoUrl',
        );
      }
      await this.clipResultsService.patch(callbackId, {
        providerJobId: videoId,
        status: 'completed',
        videoUrl,
      });
    } else if (body.event === 'VIDEO_GENERATION_FAILED') {
      await this.clipResultsService.patch(callbackId, {
        error:
          this.readString(body.data?.error) ??
          this.readString(body.data?.message) ??
          'Argil video generation failed',
        providerJobId: videoId,
        status: 'failed',
      });
    } else {
      throw new BadRequestException('Unsupported Argil callback event');
    }

    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      organizationId,
    );
  }

  private readCallbackId(extras: unknown): string | undefined {
    let value = extras;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value) as unknown;
      } catch {
        return undefined;
      }
    }
    return this.isRecord(value) ? this.readString(value.callbackId) : undefined;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
