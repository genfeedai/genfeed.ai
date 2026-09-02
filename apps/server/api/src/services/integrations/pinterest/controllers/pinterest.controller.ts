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
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
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
@Controller('services/pinterest')
export class PinterestController {
  constructor(
    private readonly pinterestService: PinterestService,
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: ConnectCredentialDto,
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

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      userId,
      CredentialPlatform.PINTEREST,
      { isConnected: false },
    );
    const url = this.pinterestService.generateAuthUrl(state);
    this.loggerService.log('Pinterest auth url');
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
      CredentialPlatform.PINTEREST,
    );

    if (!credential) {
      throw new HttpException(
        {
          detail: 'No pending credential found for this OAuth state',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    this.loggerService.log('Pinterest exchange token');
    const tokens = await this.pinterestService.exchangeCodeForToken(body.code);

    if (!tokens.accessToken) {
      throw new HttpException(
        {
          detail: 'Pinterest did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const updatedCredential = await this.credentialsService.patch(
      credential.id,
      {
        accessToken: tokens.accessToken,
        accessTokenExpiry: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : undefined,
        isConnected: true,
        isDeleted: false,
        oauthState: null,
        refreshToken: tokens.refreshToken,
      },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  @Post('pins')
  async createPin(
    @Body()
    body: {
      accessToken: string;
      boardId: string;
      imageUrl: string;
      title: string;
      description?: string;
      link?: string;
    },
  ) {
    this.loggerService.log('Pinterest create pin');
    const id = await this.pinterestService.createPin(
      body.accessToken,
      body.boardId,
      body.imageUrl,
      body.title,
      body.description,
      body.link,
    );
    return { data: { id } };
  }

  @Get('pins/:id/analytics')
  async pinAnalytics(
    @Query('accessToken') accessToken: string,
    @Param('id') id: string,
  ) {
    this.loggerService.log('Pinterest pin analytics');
    const data = await this.pinterestService.getPinAnalytics(accessToken, id);
    return { data };
  }

  @Get('search')
  async search(
    @Query('accessToken') accessToken: string,
    @Query('query') query: string,
  ) {
    this.loggerService.log('Pinterest search');
    const data = await this.pinterestService.searchPins(accessToken, query);
    return { data };
  }
}
