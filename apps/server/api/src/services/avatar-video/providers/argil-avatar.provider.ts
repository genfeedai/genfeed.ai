import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { ArgilService } from '@api/services/integrations/argil/services/argil.service';
import type { AvatarVideoProviderName } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ArgilAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'argil';

  constructor(
    private readonly argilService: ArgilService,
    private readonly loggerService: LoggerService,
  ) {}

  async generateVideo(
    input: AvatarVideoJobInput,
  ): Promise<AvatarVideoJobResult> {
    try {
      if (
        !input.avatarId.trim() ||
        !input.voiceId.trim() ||
        !input.script.trim()
      ) {
        throw new Error(
          'Argil avatar ID, voice ID, and transcript are required',
        );
      }

      if (input.referenceImageUrl) {
        throw new Error(
          'Argil Atom requires an Argil avatar ID and does not accept a reference image',
        );
      }

      const jobId = await this.argilService.generateAvatarVideo({
        avatarId: input.avatarId,
        callbackId: input.callbackId,
        onVideoCreated: async (videoId) => {
          await input.onJobCreated?.({
            jobId: videoId,
            providerName: this.providerName,
          });
        },
        organizationId: input.organizationId,
        script: input.script,
        voiceId: input.voiceId,
      });
      return { jobId, providerName: this.providerName, status: 'processing' };
    } catch (error: unknown) {
      this.loggerService.error(
        'ArgilAvatarProvider generateVideo failed',
        error,
      );
      return {
        error: error instanceof Error ? error.message : 'Argil API error',
        jobId: '',
        providerName: this.providerName,
        status: 'failed',
      };
    }
  }

  async getStatus(
    jobId: string,
    organizationId: string,
  ): Promise<AvatarVideoJobResult> {
    try {
      const result = await this.argilService.getVideoStatus(
        jobId,
        organizationId,
      );
      if (result.status === 'DONE' && result.videoUrl) {
        return {
          jobId,
          providerName: this.providerName,
          status: 'completed',
          videoUrl: result.videoUrl,
        };
      }
      if (result.status === 'DONE') {
        return {
          error: 'Argil completed without a video URL',
          jobId,
          providerName: this.providerName,
          status: 'failed',
        };
      }
      if (result.status === 'FAILED') {
        return {
          error: result.error ?? 'Argil video generation failed',
          jobId,
          providerName: this.providerName,
          status: 'failed',
        };
      }
      return { jobId, providerName: this.providerName, status: 'processing' };
    } catch (error: unknown) {
      this.loggerService.error('ArgilAvatarProvider getStatus failed', error);
      return { jobId, providerName: this.providerName, status: 'processing' };
    }
  }
}
