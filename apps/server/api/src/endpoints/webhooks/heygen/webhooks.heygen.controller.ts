import { HeygenWebhookPayloadDto } from '@api/endpoints/webhooks/dto/heygen-webhook-payload.dto';
import { HeygenWebhookService } from '@api/endpoints/webhooks/heygen/webhooks.heygen.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { assertWebhookToken } from '@server/webhooks/webhook-token.util';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/heygen')
export class HeygenWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly heygenWebhookService: HeygenWebhookService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(
    @Req() request: Request,
    @Body() payload: HeygenWebhookPayloadDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    assertWebhookToken({
      configuredSecret: this.configService.get('HEYGEN_WEBHOOK_SECRET') as
        | string
        | undefined,
      loggerService: this.loggerService,
      request,
      secretEnvVar: 'HEYGEN_WEBHOOK_SECRET',
      url,
    });

    try {
      this.loggerService.log(`${url} received`, payload);

      await this.heygenWebhookService.handleCallback(payload);

      return { detail: 'Webhook received' };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
