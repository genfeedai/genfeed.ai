import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { YoutubeAuthorizedSignalsService } from '@api/services/integrations/youtube/services/youtube-authorized-signals.service';
import {
  asYoutubeVerifyException,
  buildYoutubeVerifyFailureLog,
  buildYoutubeVerifyRequestLog,
  readYoutubeVerifyCorrelationId,
  type YoutubeOAuthVerifyProgress,
} from '@api/services/integrations/youtube/utils/youtube-oauth-verify.util';
import { completeYoutubeOAuthVerification } from '@api/services/integrations/youtube/utils/youtube-oauth-verify-completion.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/youtube')
export class YoutubeController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
    private readonly youtubeService: YoutubeService,
    private readonly youtubeAuthorizedSignalsService: YoutubeAuthorizedSignalsService,
    private readonly historyImportService: SocialSourceHistoryImportService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialDto);

    const brand = await this.brandsService.findOne({
      id: createCredentialDto.brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const { state } = await this.credentialsService.beginOAuthForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.YOUTUBE,
        {
          isConnected: false,
          isHistoryImportRequested:
            createCredentialDto.isHistoryImportRequested,
        },
        createCredentialDto.credentialId,
      );

      const authUrl = this.youtubeService.generateAuthUrl({
        accessType: 'offline',
        includeGrantedScopes: false,
        // select_account lets a Brand Account or channel be chosen again.
        // consent alone can reuse the Google identity that has no channel.
        prompt: 'consent select_account',
        // youtube.force-ssl covers every Data and Live API call Genfeed makes
        // (upload, playlists, comments, live chat); request nothing broader.
        scope: [
          'https://www.googleapis.com/auth/youtube.force-ssl',
          'https://www.googleapis.com/auth/yt-analytics.readonly',
        ],
        state,
      });

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() createCredentialVerifyDto: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const correlationId = readYoutubeVerifyCorrelationId(
      request.headers as Record<string, unknown> | undefined,
    );
    const progress: YoutubeOAuthVerifyProgress = {
      stage: 'request_validation',
    };

    this.loggerService.log(
      url,
      buildYoutubeVerifyRequestLog(createCredentialVerifyDto, correlationId),
    );

    const { code, state } = createCredentialVerifyDto;

    try {
      const credential = await completeYoutubeOAuthVerification({
        code,
        configService: this.configService,
        correlationId,
        credentialsService: this.credentialsService,
        dto: createCredentialVerifyDto,
        historyImportService: this.historyImportService,
        loggerService: this.loggerService,
        progress,
        state,
        url,
        youtubeAuthorizedSignalsService: this.youtubeAuthorizedSignalsService,
        youtubeService: this.youtubeService,
      });

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      const safeError = asYoutubeVerifyException(error, progress.stage);
      this.loggerService.error(
        `${url} failed`,
        buildYoutubeVerifyFailureLog({
          correlationId,
          error,
          safeError,
          stage: progress.stage,
        }),
      );

      throw safeError;
    }
  }

  @Post(':credentialId/authorized-signals/refresh')
  async refreshAuthorizedSignals(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    await this.youtubeAuthorizedSignalsService.refresh({
      credentialId,
      organizationId: user.organizationId,
    });

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.YOUTUBE,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'YouTube credential not found',
          title: 'Not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, CredentialSerializer, credential);
  }

  @Get('trends')
  async getTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const trends = await this.youtubeService.getTrends();
      return trends;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail:
            error instanceof Error
              ? error.message
              : 'Failed to fetch YouTube trends',
          title: 'Failed to get trends',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('metadata/:videoId')
  async getVideoMetadata(@Param('videoId') videoId: string) {
    const metadata = await this.youtubeService.getVideoMetadata(videoId);

    return {
      data: metadata,
      success: Boolean(metadata),
    };
  }
}
