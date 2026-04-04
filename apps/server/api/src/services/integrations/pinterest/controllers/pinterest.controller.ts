import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('services/pinterest')
export class PinterestController {
  constructor(
    private readonly pinterestService: PinterestService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('auth')
  getAuthUrl(@Query('state') state: string) {
    const url = this.pinterestService.generateAuthUrl(state || '');
    this.loggerService.log('Pinterest auth url');
    return { data: { url } };
  }

  @Post('token')
  async exchangeToken(@Body() body: { code: string }) {
    this.loggerService.log('Pinterest exchange token');
    const result = await this.pinterestService.exchangeCodeForToken(body.code);
    return { data: result };
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
