import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { WordpressService } from '@api/services/integrations/wordpress/services/wordpress.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('services/wordpress')
export class WordpressController {
  constructor(
    private readonly wordpressService: WordpressService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('auth')
  getAuthUrl(@Query('state') state: string) {
    const url = this.wordpressService.generateAuthUrl(state || '');
    this.loggerService.log('WordPress auth url');
    return { data: { url } };
  }

  @Post('token')
  async exchangeToken(@Body() body: { code: string }) {
    this.loggerService.log('WordPress exchange token');
    const result = await this.wordpressService.exchangeCodeForToken(body.code);
    return { data: result };
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
