import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { ByokService } from '@api/services/byok/byok.service';
import { readHeygenVideoStatus } from '@api/services/integrations/heygen/heygen-video-status';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { AvatarVideoProviderName } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HeygenAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'heygen';
  private readonly logContext = 'HeygenAvatarProvider';

  constructor(
    private readonly heygenService: HeyGenService,
    private readonly byokService: ByokService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
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
      const jobId = input.referenceImageUrl
        ? await this.heygenService.generatePhotoAvatarVideo(
            input.callbackId,
            input.referenceImageUrl,
            {
              inputText: input.script,
              voiceId: input.voiceId,
            },
            input.organizationId,
            input.userId,
            byokKey?.apiKey,
          )
        : await this.heygenService.generateAvatarVideo(
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

  async getStatus(
    jobId: string,
    organizationId: string,
  ): Promise<AvatarVideoJobResult> {
    return readHeygenVideoStatus(
      jobId,
      organizationId,
      this.byokService,
      this.apiKeyHelperService,
      this.httpService,
      this.logger,
    );
  }
}
