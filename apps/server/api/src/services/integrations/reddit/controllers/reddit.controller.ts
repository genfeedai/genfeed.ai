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
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import type { User } from '@clerk/backend';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
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
} from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

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
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, createCredentialDto);

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

    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brand._id),
        organization: new Types.ObjectId(brand.organization),
        platform: CredentialPlatform.REDDIT,
      });

      if (!credential) {
        await this.credentialsService.saveCredentials(
          brand,
          CredentialPlatform.REDDIT,
          { isConnected: false },
        );
      }

      const state = JSON.stringify({
        brandId: brand._id.toString(),
        organizationId: brand.organization.toString(),
        userId: publicMetadata.user,
      });

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

      const { brandId, organizationId } = JSON.parse(state);

      const auth = Buffer.from(
        `${this.configService.get('REDDIT_CLIENT_ID')}:${this.configService.get('REDDIT_CLIENT_SECRET')}`,
      ).toString('base64');

      const params = new URLSearchParams();
      params.append('grant_type', OAuthGrantType.AUTHORIZATION_CODE);
      params.append('code', code);
      params.append(
        'redirect_uri',
        this.configService.get('REDDIT_REDIRECT_URI')!,
      );

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

      const existingCredential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.REDDIT,
      });

      if (!existingCredential) {
        throw new HttpException(
          {
            detail: 'No pending credential found for this brand',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      let credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
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

      credential = await this.credentialsService.patch(credential._id, {
        externalHandle: profileRes.data?.name,
        externalId: profileRes.data?.id,
      });

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
