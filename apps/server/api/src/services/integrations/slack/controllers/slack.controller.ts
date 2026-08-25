import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('services/slack')
export class SlackController {
  constructor(
    private readonly slackService: SlackService,
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body('brandId') brandId: string,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;

    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: organization,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      userId,
      CredentialPlatform.SLACK,
      { isConnected: false },
    );

    const authUrl = this.slackService.generateAuthUrl(state);

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body('code') code: string,
    @Body('state') state: string,
  ) {
    if (!code || !state) {
      throw new HttpException(
        {
          detail: 'Missing required OAuth parameters',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const credential = await this.credentialsService.findPendingOAuthCredential(
      state,
      CredentialPlatform.SLACK,
      { organizationId: organization, userId },
    );

    if (!credential) {
      throw new HttpException(
        {
          detail: 'OAuth state mismatch or credential not found',
          title: 'Invalid State',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tokenData = await this.slackService.exchangeCodeForToken(code);

    const accessToken =
      tokenData?.access_token || tokenData?.authed_user?.access_token;

    if (!accessToken) {
      throw new HttpException(
        {
          detail: 'Slack did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const userInfo = await this.slackService.getUserInfo(accessToken);

    const updatedCredential = await this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId,
      {
        handle: userInfo.user,
        id: userInfo.user_id,
        name: userInfo.team,
      },
      { accessToken },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }
}
