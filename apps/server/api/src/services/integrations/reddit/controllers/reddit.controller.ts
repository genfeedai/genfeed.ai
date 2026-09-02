import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

const REDDIT_OAUTH_PLACEHOLDER_PATTERN =
  /(?:^|[_-])TODO(?:[_-]|$)|your_reddit_client_(?:id|secret)/i;

@AutoSwagger()
@Controller('services/reddit')
export class RedditController {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly tokenUrl = 'https://www.reddit.com/api/v1/access_token';
  private readonly apiUrl = 'https://oauth.reddit.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly redditService: RedditService,
    private readonly httpService: HttpService,
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

    this.getOAuthConfig();

    try {
      const { state } = await this.credentialsService.beginOAuthForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.REDDIT,
        { isConnected: false },
      );

      const authUrl = this.redditService.generateAuthUrl(state);

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
    this.loggerService.log(url, createCredentialVerifyDto);

    const { code, state } = createCredentialVerifyDto;

    try {
      if (!code || !state) {
        throw new HttpException(
          { detail: 'Missing code or identifiers', title: 'Invalid payload' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.REDDIT,
        );

      if (!existingCredential) {
        throw new HttpException(
          {
            detail: 'No pending credential found for this OAuth state',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const { organizationId } = existingCredential;
      const { clientId, clientSecret, redirectUri } = this.getOAuthConfig();

      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );

      const params = new URLSearchParams();
      params.append('grant_type', OAuthGrantType.AUTHORIZATION_CODE);
      params.append('code', code);
      params.append('redirect_uri', redirectUri);

      const tokenRes = await firstValueFrom(
        this.httpService.post(this.tokenUrl, params.toString(), {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
          },
        }),
      );

      const { access_token, refresh_token, expires_in } = tokenRes.data;

      if (!access_token) {
        throw new HttpException(
          {
            detail: 'Reddit did not return an access token',
            title: 'Token exchange failed',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      let credential = await this.credentialsService.patch(
        existingCredential.id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          oauthState: null,
          refreshToken: refresh_token,
        },
      );

      const profileRes = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/api/v1/me`, {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'User-Agent':
              this.configService.get('REDDIT_USER_AGENT') || 'genfeed',
          },
        }),
      );

      credential = await this.credentialsService.updateExternalProfile(
        credential.id,
        organizationId,
        {
          avatarUrl: profileRes.data?.icon_img,
          handle: profileRes.data?.name,
          id: profileRes.data?.id,
          name: profileRes.data?.name,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private getOAuthConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.configService.get('REDDIT_CLIENT_ID');
    const clientSecret = this.configService.get('REDDIT_CLIENT_SECRET');
    const redirectUri = this.configService.get('REDDIT_REDIRECT_URI');

    if (
      !clientId ||
      !clientSecret ||
      !redirectUri ||
      [clientId, clientSecret, redirectUri].some(
        (value) =>
          isUnconfiguredSecret(value) ||
          REDDIT_OAUTH_PLACEHOLDER_PATTERN.test(value),
      )
    ) {
      throw new ServiceUnavailableException(
        'Reddit OAuth is not configured for this deployment.',
      );
    }

    return { clientId, clientSecret, redirectUri };
  }
}
