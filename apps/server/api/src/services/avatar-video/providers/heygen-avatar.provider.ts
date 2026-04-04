import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
  AvatarVideoProviderName,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HeygenAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'heygen';
  private readonly logContext = 'HeygenAvatarProvider';
  private readonly statusUrl = 'https://api.heygen.com/v1/video_status.get';

  constructor(
    private readonly heygenService: HeyGenService,
    private readonly byokService: ByokService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {}

  async generateVideo(
    input: AvatarVideoJobInput,
  ): Promise<AvatarVideoJobResult> {
    this.logger.log(`${this.logContext} generateVideo`, {
      avatarId: input.avatarId,
      scriptLength: input.script.length,
    });

    const byokKey = await this.byokService.resolveApiKey(
      input.organizationId,
      ByokProvider.HEYGEN,
    );

    try {
      const jobId = await this.heygenService.generateAvatarVideo(
        input.callbackId,
        input.avatarId,
        input.voiceId,
        input.script,
        input.organizationId,
        input.userId,
        byokKey?.apiKey,
      );

      return {
        jobId,
        providerName: this.providerName,
        status: 'processing',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'HeyGen API error';
      this.logger.error(`${this.logContext} generateVideo failed`, error);

      return {
        error: errorMessage,
        jobId: '',
        providerName: this.providerName,
        status: 'failed',
      };
    }
  }

  async getStatus(jobId: string): Promise<AvatarVideoJobResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.statusUrl, {
          headers: { 'X-Api-Key': '' },
          params: { video_id: jobId },
          timeout: 15_000,
        }),
      );

      const data = response.data?.data;

      if (!data) {
        return { jobId, providerName: this.providerName, status: 'processing' };
      }

      if (data.status === 'completed') {
        return {
          jobId,
          providerName: this.providerName,
          status: 'completed',
          videoUrl: data.video_url,
        };
      }

      if (data.status === 'failed' || data.status === 'error') {
        return {
          error: data.error || 'HeyGen video generation failed',
          jobId,
          providerName: this.providerName,
          status: 'failed',
        };
      }

      return { jobId, providerName: this.providerName, status: 'processing' };
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} getStatus failed`, error);
      return { jobId, providerName: this.providerName, status: 'processing' };
    }
  }
}
