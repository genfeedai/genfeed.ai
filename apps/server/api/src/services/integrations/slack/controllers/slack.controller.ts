import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { claimOAuthVerifyCredential } from '@api/collections/credentials/utils/oauth-verify-claim.util';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import { ApiKeyScope, CredentialPlatform } from '@genfeedai/contracts';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/slack')
export class SlackController {
  constructor(
    private readonly slackService: SlackService,
    private readonly credentialsService: CredentialsService,
    private readonly brandsService: BrandsService,
  ) {}

  /**
   * Generate the OAuth URL and create a pending credential.
   *
   * POST /services/slack/connect
   */
  @Post('connect')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body('brandId') brandId: string,
  ) {
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: user.organizationId,
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
      user.userId ?? user.id,
      CredentialPlatform.SLACK,
      { isConnected: false },
    );

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: this.slackService.generateAuthUrl(state),
    });
  }

  /**
   * Exchange the OAuth code and save the workspace's bot token.
   *
   * POST /services/slack/verify
   */
  @Post('verify')
  @RequiredScopes(ApiKeyScope.ADMIN)
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

    const claim = await claimOAuthVerifyCredential(
      this.credentialsService,
      state,
      CredentialPlatform.SLACK,
      { organizationId: user.organizationId, userId: user.userId ?? user.id },
    );
    if (claim?.alreadyConnected) {
      return serializeSingle(request, CredentialSerializer, claim.credential);
    }
    const credential = claim?.credential;

    if (!credential) {
      throw new HttpException(
        {
          detail: 'OAuth state mismatch or credential not found',
          title: 'Invalid State',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const installation = await this.slackService.exchangeCodeForToken(code);

    // The workspace is the identity: reconnecting it refreshes the row, and a
    // second workspace is an additional account. The channel is chosen per post.
    const updatedCredential = await this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId,
      {
        handle: installation.teamName ?? installation.teamId,
        id: installation.teamId,
        name: installation.teamName ?? installation.teamId,
      },
      { accessToken: installation.accessToken },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  /**
   * Channels of a connected workspace, for the channel picker.
   *
   * GET /services/slack/channels?brandId=…&credentialId=…
   *
   * The organization is the one the request is pinned to (a verified
   * superadmin's `?organizationId=` override, otherwise the session's), so the
   * credential lookup always matches the tenant context of the request.
   */
  @Get('channels')
  async channels(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Query('brandId') brandId: string,
    @Query('credentialId') credentialId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      { brandId, organizationId },
      user,
      request,
    );
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      organizationId: tenant.organizationId,
      platform: CredentialPlatform.SLACK,
    });

    if (!credential?.accessToken) {
      throw new HttpException(
        {
          detail: 'Slack workspace not found for this brand',
          title: 'Not Found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      data: await this.slackService.listChannels(
        EncryptionUtil.decrypt(credential.accessToken),
      ),
    };
  }
}
