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
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  buildGrantedScopesCredentialPatch,
  parseGrantedOAuthScopes,
} from '@genfeedai/helpers';
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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/facebook')
export class FacebookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly facebookService: FacebookService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

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

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.FACEBOOK,
      {
        isConnected: false,
      },
    );

    const authUrl = this.facebookService.generateAuthUrl(state);

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() body: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    try {
      if (!body.code || !body.state) {
        throw new HttpException(
          {
            detail: 'Missing required OAuth parameters',
            title: 'Invalid payload',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const credential =
        await this.credentialsService.findPendingOAuthCredential(
          body.state,
          CredentialPlatform.FACEBOOK,
        );

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Facebook credential not found',
            title: 'OAuth Error',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { organizationId } = credential;

      const { accessToken, expiresIn, scope } =
        await this.facebookService.exchangeAuthCodeForAccessToken(body.code);

      if (!accessToken) {
        throw new HttpException(
          {
            detail: 'Facebook did not return an access token',
            title: 'Token exchange failed',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      const profile = await this.facebookService.getUserProfile(accessToken);
      const normalizedTokenScopes = parseGrantedOAuthScopes(scope);
      let grantedScopes: unknown =
        normalizedTokenScopes.length > 0 ? normalizedTokenScopes : undefined;
      if (grantedScopes === undefined) {
        try {
          grantedScopes =
            await this.facebookService.getGrantedPermissions(accessToken);
        } catch (permissionError: unknown) {
          this.loggerService.warn(
            `${url} permission capture failed after connection`,
            permissionError,
          );
        }
      }

      let updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          accessToken,
          accessTokenExpiry: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined,
          isConnected: true,
          isDeleted: false,
          oauthState: null,
          ...buildGrantedScopesCredentialPatch(grantedScopes),
        },
      );

      updatedCredential = await this.credentialsService.updateExternalProfile(
        updatedCredential.id,
        organizationId,
        {
          avatarUrl: profile.picture?.data?.url,
          handle: profile.email || profile.name,
          id: credential.externalId || profile.id,
          name: profile.name,
        },
      );

      return serializeSingle(request, CredentialSerializer, updatedCredential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Get('callback')
  handleCallback() {
    return {
      url: `${this.configService.get('GENFEEDAI_APP_URL')}/accounts?facebook=connected`,
    };
  }

  @Get('pages')
  async getUserPages(@CurrentUser() user: User) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const pages = await this.facebookService.getUserPages(
      user.organizationId,
      user.brandId,
    );

    return { pages };
  }

  @Post('post')
  async createPost(
    @CurrentUser() _user: User,
    @Body()
    body: {
      pageId: string;
      pageAccessToken: string;
      message: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video';
    },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const { pageId, pageAccessToken, message, mediaUrl, mediaType } = body;

    let postId: string;

    if (mediaUrl && mediaType === 'image') {
      postId = await this.facebookService.uploadImage(
        pageId,
        pageAccessToken,
        mediaUrl,
        message,
      );
    } else if (mediaUrl && mediaType === 'video') {
      postId = await this.facebookService.uploadVideoByUrl(
        pageId,
        pageAccessToken,
        mediaUrl,
        message,
        message,
      );
    } else {
      postId = await this.facebookService.createTextPost(
        pageId,
        pageAccessToken,
        message,
      );
    }

    return { postId };
  }

  @Post('schedule')
  async schedulePost(
    @CurrentUser() _user: User,
    @Body()
    body: {
      pageId: string;
      pageAccessToken: string;
      message: string;
      scheduledTime: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video';
    },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const {
      pageId,
      pageAccessToken,
      message,
      scheduledTime,
      mediaUrl,
      mediaType,
    } = body;

    const scheduledPublishTime = Math.floor(
      new Date(scheduledTime).getTime() / 1000,
    );

    const postId = await this.facebookService.schedulePost(
      pageId,
      pageAccessToken,
      message,
      scheduledPublishTime,
      mediaUrl,
      mediaType,
    );

    return { postId };
  }

  @Get(':facebookId/analytics')
  async getPostAnalytics(
    @CurrentUser() _user: User,
    @Param('facebookId') facebookId: string,
    @Query('accessToken') accessToken: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const analytics = await this.facebookService.getPostAnalytics(
      facebookId,
      accessToken,
    );

    return analytics;
  }
}
