import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import {
  ClipResultsService,
  type ProviderTerminalTransitionInput,
} from '@api/collections/clip-results/clip-results.service';
import type { ArgilWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class ArgilWebhookService {
  constructor(
    private readonly clipLibraryLinkService: ClipLibraryLinkService,
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
    if (providerName !== 'argil' || providerJobId !== videoId) {
      throw new BadRequestException(
        'Argil callback does not match the stored provider job',
      );
    }

    const projectId = this.readString(record.projectId);
    if (!projectId) {
      throw new BadRequestException('Argil clip result is missing projectId');
    }

    const organizationId = this.readString(record.organizationId);
    let transition: Pick<
      ProviderTerminalTransitionInput,
      'error' | 'status' | 'videoUrl'
    >;
    if (body.event === 'VIDEO_GENERATION_SUCCESS') {
      const videoUrl = this.readString(body.data?.videoUrl);
      if (!videoUrl) {
        throw new BadRequestException(
          'Successful Argil callback requires data.videoUrl',
        );
      }
      transition = { status: 'completed', videoUrl };
    } else if (body.event === 'VIDEO_GENERATION_FAILED') {
      transition = {
        error:
          this.readString(body.data?.error) ??
          this.readString(body.data?.message) ??
          'Argil video generation failed',
        status: 'failed',
      };
    } else {
      throw new BadRequestException('Unsupported Argil callback event');
    }

    const transitioned =
      await this.clipResultsService.transitionProviderTerminal({
        clipResultId: callbackId,
        providerJobId: videoId,
        providerName: 'argil',
        ...transition,
      });
    if (transition.status === 'completed' && organizationId) {
      await this.clipLibraryLinkService.linkReadyClip({
        clipResultId: callbackId,
        organizationId,
      });
    }
    if (!transitioned) {
      this.loggerService.log('ArgilWebhookService terminal callback replay', {
        callbackId,
        videoId,
      });
      return;
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
