import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreateCredentialVerifyDto } from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ConnectShopifyCredentialDto } from '@api/services/integrations/shopify/dto/connect-shopify-credential.dto';
import {
  normalizeShopifyShopDomain,
  ShopifyService,
} from '@api/services/integrations/shopify/services/shopify.service';
import { CredentialPlatform } from '@genfeedai/contracts';
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
@Controller('services/shopify')
export class ShopifyController {
  constructor(
    private readonly shopifyService: ShopifyService,
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: ConnectShopifyCredentialDto,
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

    const shop = normalizeShopifyShopDomain(body.shop);
    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      userId,
      CredentialPlatform.SHOPIFY,
      { externalHandle: shop, isConnected: false },
    );
    const url = this.shopifyService.generateAuthUrl(shop, state);
    this.loggerService.log('Shopify auth url');
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
      CredentialPlatform.SHOPIFY,
    );

    if (!credential?.externalHandle) {
      throw new HttpException(
        {
          detail: 'No pending Shopify credential found for this OAuth state',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    this.loggerService.log('Shopify exchange token');
    const tokens = await this.shopifyService.exchangeCodeForToken(
      credential.externalHandle,
      body.code,
    );

    if (!tokens.accessToken) {
      throw new HttpException(
        {
          detail: 'Shopify did not return an access token',
          title: 'Token exchange failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    // The shop domain carried on the pending row is the account identity.
    const updatedCredential = await this.credentialsService.connectAccount(
      credential.id,
      credential.organizationId,
      {
        handle: credential.externalHandle,
        id: credential.externalHandle,
        name: credential.externalHandle,
      },
      { accessToken: tokens.accessToken },
    );

    return serializeSingle(request, CredentialSerializer, updatedCredential);
  }

  @Post('products')
  async createProduct(
    @Body()
    body: {
      shop: string;
      accessToken: string;
      title: string;
      bodyHtml: string;
      images: string[];
      variants?: Array<{ price: string; title?: string }>;
      tags?: string[];
    },
  ) {
    this.loggerService.log('Shopify create product');
    const product = await this.shopifyService.createProduct(
      body.shop,
      body.accessToken,
      body.title,
      body.bodyHtml,
      body.images,
      body.variants,
      body.tags,
    );
    return { data: product };
  }
}
