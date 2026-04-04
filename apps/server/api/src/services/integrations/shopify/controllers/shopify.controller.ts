import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ShopifyService } from '@api/services/integrations/shopify/services/shopify.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('services/shopify')
export class ShopifyController {
  constructor(
    private readonly shopifyService: ShopifyService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('auth')
  getAuthUrl(@Query('shop') shop: string, @Query('state') state: string) {
    const url = this.shopifyService.generateAuthUrl(shop, state || '');
    this.loggerService.log('Shopify auth url');
    return { data: { url } };
  }

  @Post('token')
  async exchangeToken(@Body() body: { shop: string; code: string }) {
    this.loggerService.log('Shopify exchange token');
    const result = await this.shopifyService.exchangeCodeForToken(
      body.shop,
      body.code,
    );
    return { data: result };
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
