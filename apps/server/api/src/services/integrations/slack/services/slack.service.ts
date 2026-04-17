import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SlackService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly clientId: string | undefined;

  private readonly clientSecret: string | undefined;

  private readonly redirectUri: string | undefined;

  private readonly authUrl = 'https://slack.com/oauth/v2/authorize';
  private readonly tokenUrl = 'https://slack.com/api/oauth.v2.access';
  private readonly authTestUrl = 'https://slack.com/api/auth.test';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {
    this.clientId = this.configService.get('SLACK_CLIENT_ID');
    this.clientSecret = this.configService.get('SLACK_CLIENT_SECRET');
    this.redirectUri = this.configService.get('SLACK_REDIRECT_URI');
  }

  generateAuthUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Slack OAuth configuration is missing. Please set SLACK_CLIENT_ID and SLACK_REDIRECT_URI environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'chat:write,commands,users:read',
      state,
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Slack OAuth configuration is missing. Please set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_REDIRECT_URI environment variables.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
      });

      const response = await firstValueFrom(
        this.httpService.post(this.tokenUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      if (!response.data.ok) {
        throw new HttpException(
          {
            detail: response.data.error || 'Slack OAuth failed',
            title: 'Token Exchange Failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.loggerService.log(`${url} succeeded`, {
        hasAccessToken: !!response.data.access_token,
        teamId: response.data.team?.id,
      });

      return response.data;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: 'Failed to exchange code for token',
          title: 'Token Exchange Failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getUserInfo(accessToken: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.authTestUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );

      if (!response.data.ok) {
        throw new HttpException(
          {
            detail: response.data.error || 'Failed to get Slack user info',
            title: 'Get User Failed',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.loggerService.log(`${url} succeeded`, {
        teamId: response.data.team_id,
        userId: response.data.user_id,
      });

      return response.data;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: 'Failed to get Slack user info',
          title: 'Get User Failed',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async disconnect(organizationId: string, brandId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.SLACK,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Slack credential not found',
            title: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      await this.credentialsService.patch(credential._id, {
        isConnected: false,
        isDeleted: true,
      });

      this.loggerService.log(`${url} disconnected credential`, {
        credentialId: credential._id,
      });

      return { success: true };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: 'Failed to disconnect Slack',
          title: 'Disconnect Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
