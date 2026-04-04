import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('services/snapchat')
export class SnapchatController {
  constructor(
    private readonly snapchatService: SnapchatService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('auth')
  getAuthUrl(@Query('state') state: string) {
    const url = this.snapchatService.generateAuthUrl(state || '');
    this.loggerService.log('Snapchat auth url');
    return { data: { url } };
  }

  @Post('token')
  async exchangeToken(@Body() body: { code: string }) {
    this.loggerService.log('Snapchat exchange token');
    const result = await this.snapchatService.exchangeCodeForToken(body.code);
    return { data: result };
  }
}
