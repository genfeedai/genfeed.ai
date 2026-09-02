import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RestreamService } from '@api/services/integrations/restream/services/restream.service';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
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
  Optional,
  Post,
  Req,
  type Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

@Controller('services/restream')
export class RestreamController {
  constructor(
    private readonly restreamService: RestreamService,
    @Optional()
    private readonly credentialsService: CredentialsService | undefined,
    @Optional() private readonly brandsService: BrandsService | undefined,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  /**
   * POST /services/restream/connect
   * Start Restream OAuth and create a pending credential.
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body('brandId') brandId: string,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const organizationId = requireRelationId(
      organization,
      'organization',
      'Restream OAuth',
    );
    const resolvedUserId = requireRelationId(userId, 'user', 'Restream OAuth');
    const brandsService = this.resolveRequiredProvider(
      this.brandsService,
      BrandsService,
    );
    const credentialsService = this.resolveRequiredProvider(
      this.credentialsService,
      CredentialsService,
    );
    const brand = await brandsService.findOne({
      id: brandId,
      organizationId,
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

    if (!this.restreamService.isConfigured()) {
      throw new HttpException(
        {
          detail:
            'Restream is not configured on this deployment. Set RESTREAM_CLIENT_ID, RESTREAM_CLIENT_SECRET, and RESTREAM_REDIRECT_URI.',
          title: 'Configuration Error',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const { state } = await credentialsService.beginOAuthForBrand(
      brand,
      resolvedUserId,
      CredentialPlatform.RESTREAM,
      { isConnected: false },
    );

    const authUrl = this.restreamService.generateAuthUrl(state);

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  /**
   * POST /services/restream/verify
   * Exchange code and store tokens on the pending credential.
   */
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
    const organizationId = requireRelationId(
      organization,
      'organization',
      'Restream OAuth',
    );
    const resolvedUserId = requireRelationId(userId, 'user', 'Restream OAuth');
    const credentialsService = this.resolveRequiredProvider(
      this.credentialsService,
      CredentialsService,
    );
    const credential = await credentialsService.findPendingOAuthCredential(
      state,
      CredentialPlatform.RESTREAM,
      { organizationId, userId: resolvedUserId },
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

    const tokenData = await this.restreamService.exchangeCodeForToken(code);
    if (!tokenData?.access_token) {
      throw new HttpException(
        {
          detail: 'Restream did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const profile = await this.restreamService.getProfile(
      tokenData.access_token,
    );

    const updatedCredential = await credentialsService.connectAccount(
      requireRelationId(credential.id, 'id', 'Restream credential'),
      organizationId,
      {
        handle: profile.username,
        id: profile.id,
        name: profile.username || 'Restream',
      },
      {
        accessToken: tokenData.access_token,
        accessTokenExpiry: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : undefined,
        refreshToken: tokenData.refresh_token,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  private resolveRequiredProvider<T>(direct: T | undefined, token: Type<T>): T {
    if (direct) {
      return direct;
    }
    try {
      const resolved = this.moduleRef?.get(token, { strict: false });
      if (resolved) {
        return resolved;
      }
    } catch {
      // Converted below to a stable API error.
    }
    throw new HttpException(
      { detail: 'Restream dependencies are unavailable', title: 'Unavailable' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
