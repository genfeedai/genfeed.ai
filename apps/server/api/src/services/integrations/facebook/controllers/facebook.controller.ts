import { ConfigService } from '@api/config/config.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';

@AutoSwagger()
@Controller('facebook')
export class FacebookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly facebookService: FacebookService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('auth')
  initializeAuth(@CurrentUser() user: User) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const publicMetadata = getPublicMetadata(user);
    const state = Buffer.from(
      JSON.stringify({
        brandId: publicMetadata.brand,
        userId: publicMetadata.user,
      }),
    ).toString('base64');

    const authUrl = this.facebookService.generateAuthUrl(state);

    return { authUrl };
  }

  @Get('callback')
  @Redirect()
  handleCallback() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    try {
      // const _stateData = JSON.parse(
      //   Buffer.from(state, 'base64').toString('utf-8'),
      // );

      // const { accessToken } =
      //   await this.facebookService.exchangeAuthCodeForAccessToken(code);

      // const profile = await this.facebookService.getUserProfile(accessToken);

      // Save credentials
      // This would be handled by your credential service

      return {
        url: `${this.configService.get('GENFEEDAI_APP_URL')}/accounts?facebook=connected`,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return {
        url: `${this.configService.get('GENFEEDAI_APP_URL')}/accounts?error=facebook_connection_failed`,
      };
    }
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

  @Get(':facebookId/analyticss')
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
