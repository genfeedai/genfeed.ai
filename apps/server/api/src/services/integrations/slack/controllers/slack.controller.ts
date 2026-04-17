import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

@Controller('services/slack')
export class SlackController {
  constructor(
    private readonly slackService: SlackService,
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
  ) {}

  @Post('connect')
  async connect(@CurrentUser() user: User, @Body('brandId') brandId: string) {
    const { organization, user: userId } = getPublicMetadata(user);

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organization),
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

    const orgId = new Types.ObjectId(organization);
    const state = Math.random().toString(36).substring(2, 15);

    const existingCredential = await this.credentialsService.findOne({
      brand: new Types.ObjectId(brandId),
      organization: orgId,
      platform: CredentialPlatform.SLACK,
    });

    if (existingCredential) {
      await this.credentialsService.patch(existingCredential._id, {
        isConnected: false,
        isDeleted: false,
        oauthState: state,
      });
    } else {
      await this.credentialsService.create({
        brand: new Types.ObjectId(brandId),
        isConnected: false,
        // @ts-expect-error TS2353
        isDeleted: false,
        oauthState: state,
        organization: orgId,
        platform: CredentialPlatform.SLACK,
        user: new Types.ObjectId(userId),
      });
    }

    const authUrl = this.slackService.generateAuthUrl(state);

    return {
      state,
      url: authUrl,
    };
  }

  @Post('verify')
  async verify(
    @CurrentUser() user: User,
    @Body('brandId') brandId: string,
    @Body('code') code: string,
    @Body('state') state: string,
  ) {
    const { organization } = getPublicMetadata(user);

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organization),
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

    const credential = await this.credentialsService.findOne({
      brand: new Types.ObjectId(brandId),
      oauthState: state,
      organization: new Types.ObjectId(organization),
      platform: CredentialPlatform.SLACK,
    });

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
      tokenData.access_token || tokenData.authed_user?.access_token;

    const userInfo = await this.slackService.getUserInfo(accessToken);

    const updatedCredential = await this.credentialsService.patch(
      credential._id,
      {
        accessToken,
        externalHandle: userInfo.user,
        externalId: userInfo.user_id,
        externalName: userInfo.team,
        isConnected: true,
        oauthState: null,
      },
    );

    return updatedCredential;
  }

  @Post('disconnect')
  async disconnect(
    @CurrentUser() user: User,
    @Body('brandId') brandId: string,
  ) {
    const { organization } = getPublicMetadata(user);

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organization),
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

    return this.slackService.disconnect(organization, brandId);
  }
}
