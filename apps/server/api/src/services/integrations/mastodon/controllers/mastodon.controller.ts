import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreateCredentialVerifyDto } from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ConnectMastodonCredentialDto } from '@api/services/integrations/mastodon/dto/connect-mastodon-credential.dto';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/mastodon')
export class MastodonController {
  constructor(
    private readonly mastodonService: MastodonService,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: ConnectMastodonCredentialDto,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const brand = await this.brandsService.findOne({
      id: body.brandId,
      organizationId: organization,
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

    const redirectUri = this.getRedirectUri();
    const registration = await this.mastodonService.registerApp(
      body.instanceUrl,
      redirectUri,
    );
    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      userId,
      CredentialPlatform.MASTODON,
      {
        description: body.instanceUrl,
        isConnected: false,
        oauthToken: registration.client_id,
        oauthTokenSecret: registration.client_secret,
      },
    );
    const url = this.mastodonService.generateAuthUrl(
      body.instanceUrl,
      registration.client_id,
      redirectUri,
      state,
    );

    this.loggerService.log('Mastodon auth url', {
      instanceUrl: body.instanceUrl,
    });
    return serializeSingle(request, CredentialOAuthSerializer, { url });
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() body: Partial<CreateCredentialVerifyDto>,
  ) {
    if (!body.code || !body.state) {
      throw new HttpException(
        {
          detail: 'Missing required OAuth parameters',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const credential = await this.credentialsService.findPendingOAuthCredential(
      body.state,
      CredentialPlatform.MASTODON,
    );

    if (
      !credential?.description ||
      !credential.oauthToken ||
      !credential.oauthTokenSecret
    ) {
      throw new HttpException(
        {
          detail: 'No complete Mastodon credential found for this OAuth state',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const access = await this.mastodonService.exchangeCodeForToken(
      credential.description,
      EncryptionUtil.decrypt(credential.oauthToken),
      EncryptionUtil.decrypt(credential.oauthTokenSecret),
      body.code,
      this.getRedirectUri(),
    );

    if (!access.accessToken) {
      throw new HttpException(
        {
          detail: 'Mastodon did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const account = await this.mastodonService.verifyCredentials(
      credential.description,
      access.accessToken,
    );
    let updatedCredential = await this.credentialsService.patch(credential.id, {
      accessToken: access.accessToken,
      isConnected: true,
      isDeleted: false,
      oauthState: null,
      oauthToken: null,
      oauthTokenSecret: null,
    });
    updatedCredential = await this.credentialsService.updateExternalProfile(
      updatedCredential.id,
      credential.organizationId,
      {
        avatarUrl: account.avatar,
        handle: account.acct || account.username,
        id: account.id,
        name: account.display_name || account.username,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  private getRedirectUri(): string {
    const appUrl = this.configService.get('GENFEEDAI_APP_URL');

    if (!appUrl) {
      throw new HttpException(
        {
          detail: 'GENFEEDAI_APP_URL is required for Mastodon OAuth',
          title: 'Configuration error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return `${appUrl.replace(/\/+$/, '')}/oauth/mastodon`;
  }
}
