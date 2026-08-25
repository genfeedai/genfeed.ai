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
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
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
@Controller('services/wordpress')
export class WordpressController {
  constructor(
    private readonly wordpressService: WordpressService,
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
      CredentialPlatform.WORDPRESS,
      { isConnected: false },
    );
    const url = this.wordpressService.generateAuthUrl(state);
    this.loggerService.log('WordPress auth url');
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
      CredentialPlatform.WORDPRESS,
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

    this.loggerService.log('WordPress exchange token');
    const tokens = await this.wordpressService.exchangeCodeForToken(body.code);

    if (!tokens.accessToken) {
      throw new HttpException(
        {
          detail: 'WordPress did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    // The blog id is the account identity, so a brand can connect several
    // WordPress blogs instead of the newest replacing the last.
    const updatedCredential = await this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId,
      {
        handle: tokens.blogUrl,
        id: tokens.blogId,
        name: tokens.blogUrl,
      },
      { accessToken: tokens.accessToken },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  @Post('posts')
  async createPost(
    @Body()
    body: {
      accessToken: string;
      siteId: string;
      title: string;
      content: string;
      status?: string;
      categories?: string[];
      tags?: string[];
      featuredImage?: string;
    },
  ) {
    this.loggerService.log('WordPress create post');
    const id = await this.wordpressService.createPost(
      body.accessToken,
      body.siteId,
      body.title,
      body.content,
      body.status,
      body.categories,
      body.tags,
      body.featuredImage,
    );
    return { data: { id } };
  }
}
