import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  CreateCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
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
import { Types } from 'mongoose';

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
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const publicMetadata = getPublicMetadata(user);
    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(createCredentialDto.brand),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
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

    const state = Buffer.from(
      JSON.stringify({
        brandId: brand._id,
        organizationId: brand.organization,
        userId: publicMetadata.user,
      }),
    ).toString('base64');

    await this.credentialsService.saveCredentials(
      brand,
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

      const stateData = JSON.parse(
        Buffer.from(body.state, 'base64').toString('utf-8'),
      ) as {
        brandId: string;
        organizationId: string;
      };

      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(stateData.brandId),
        isDeleted: false,
        organization: new Types.ObjectId(stateData.organizationId),
        platform: CredentialPlatform.FACEBOOK,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Facebook credential not found',
            title: 'OAuth Error',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { accessToken, expiresIn } =
        await this.facebookService.exchangeAuthCodeForAccessToken(body.code);
      const profile = await this.facebookService.getUserProfile(accessToken);

      const updatedCredential = await this.credentialsService.patch(
        credential._id,
        {
          accessToken,
          accessTokenExpiry: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined,
          externalHandle: profile.email || profile.name,
          externalId: credential.externalId || profile.id,
          externalName: profile.name,
          isConnected: true,
          isDeleted: false,
        },
      );

      return serializeSingle(request, CredentialSerializer, updatedCredential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Get('auth')
  initializeAuth(@CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const state = Buffer.from(
      JSON.stringify({
        brandId: publicMetadata.brand,
        userId: publicMetadata.user,
      }),
    ).toString('base64');

    return { authUrl: this.facebookService.generateAuthUrl(state) };
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

    const publicMetadata = getPublicMetadata(user);

    const pages = await this.facebookService.getUserPages(
      publicMetadata.organization,
      publicMetadata.brand,
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
