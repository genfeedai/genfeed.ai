import { ManagedInferenceProvider } from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import type { AvatarVideoProviderName } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const GENFEEDAI_CLIP_VIDEO_MODEL = 'genfeedai/clip-video';

@Injectable()
export class GenfeedaiAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'genfeedai';

  constructor(
    private readonly managedInferenceClient: ManagedInferenceClientService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async generateVideo(
    input: AvatarVideoJobInput,
  ): Promise<AvatarVideoJobResult> {
    const jobId = `genfeedai-clip-${input.callbackId}`;

    try {
      const apiKey = this.configService.get('GENFEED_API_KEY');
      if (!apiKey) {
        throw new Error(
          'GenfeedAI managed clip generation is not enabled for this deployment',
        );
      }
      if (!input.referenceImageUrl) {
        throw new Error(
          'GenfeedAI managed clip generation requires a selected character reference image',
        );
      }
      if (!input.script.trim()) {
        throw new Error('GenfeedAI managed clip generation requires a script');
      }

      await input.onJobCreated?.({ jobId, providerName: this.providerName });

      const endpointUrl = this.configService.get(
        'GENFEED_MANAGED_INFERENCE_URL',
      );
      const videoUrl = await this.managedInferenceClient.generateVideo({
        apiKey,
        ...(endpointUrl ? { endpointUrl } : {}),
        input: {
          aspectRatio: '9:16',
          height: 1920,
          imageUrl: input.referenceImageUrl,
          prompt: input.script,
          width: 1080,
        },
        model: GENFEEDAI_CLIP_VIDEO_MODEL,
        provider: ManagedInferenceProvider.GENFEEDAI,
      });

      this.assertPublicVideoUrl(videoUrl);
      return {
        jobId,
        providerName: this.providerName,
        status: 'completed',
        videoUrl,
      };
    } catch (error: unknown) {
      this.logger.error('GenfeedaiAvatarProvider generateVideo failed', error);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'GenfeedAI managed clip generation failed',
        jobId,
        providerName: this.providerName,
        status: 'failed',
      };
    }
  }

  async getStatus(jobId: string): Promise<AvatarVideoJobResult> {
    return {
      error:
        'GenfeedAI managed clip jobs complete inline and do not expose a polling endpoint',
      jobId,
      providerName: this.providerName,
      status: 'failed',
    };
  }

  private assertPublicVideoUrl(value: string): void {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      throw new Error(
        'GenfeedAI managed clip generation returned an invalid video URL',
      );
    }
  }
}
