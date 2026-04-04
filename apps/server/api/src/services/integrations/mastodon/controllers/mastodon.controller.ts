import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('services/mastodon')
export class MastodonController {
  constructor(
    private readonly mastodonService: MastodonService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('register')
  async registerApp(
    @Body() body: { instanceUrl: string; redirectUri: string },
  ) {
    this.loggerService.log('Mastodon register app', {
      instanceUrl: body.instanceUrl,
    });
    const result = await this.mastodonService.registerApp(
      body.instanceUrl,
      body.redirectUri,
    );
    return { data: result };
  }

  @Get('auth')
  getAuthUrl(
    @Query('instanceUrl') instanceUrl: string,
    @Query('clientId') clientId: string,
    @Query('redirectUri') redirectUri: string,
    @Query('state') state: string,
  ) {
    const url = this.mastodonService.generateAuthUrl(
      instanceUrl,
      clientId,
      redirectUri,
      state || '',
    );
    this.loggerService.log('Mastodon auth url', { instanceUrl });
    return { data: { url } };
  }

  @Post('token')
  async exchangeToken(
    @Body()
    body: {
      instanceUrl: string;
      clientId: string;
      clientSecret: string;
      code: string;
      redirectUri: string;
    },
  ) {
    this.loggerService.log('Mastodon exchange token', {
      instanceUrl: body.instanceUrl,
    });
    const result = await this.mastodonService.exchangeCodeForToken(
      body.instanceUrl,
      body.clientId,
      body.clientSecret,
      body.code,
      body.redirectUri,
    );
    return { data: result };
  }

  @Post('verify')
  async verifyCredentials(
    @Body() body: { instanceUrl: string; accessToken: string },
  ) {
    this.loggerService.log('Mastodon verify credentials', {
      instanceUrl: body.instanceUrl,
    });
    const result = await this.mastodonService.verifyCredentials(
      body.instanceUrl,
      body.accessToken,
    );
    return { data: result };
  }
}
