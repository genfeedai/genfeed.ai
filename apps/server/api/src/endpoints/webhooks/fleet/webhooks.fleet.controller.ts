import { FleetVoiceCloneWebhookPayloadDto } from '@api/endpoints/webhooks/dto/fleet-voice-clone-webhook-payload.dto';
import { FleetWebhookService } from '@api/endpoints/webhooks/fleet/webhooks.fleet.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { assertWebhookToken } from '@api/webhooks/webhook-token.util';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/fleet')
export class FleetWebhookController {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly fleetWebhookService: FleetWebhookService,
  ) {}

  @HttpCode(200)
  @Post('voice-clone')
  async handleVoiceCloneCompletion(
    @Req() request: Request,
    @Body() payload: FleetVoiceCloneWebhookPayloadDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    assertWebhookToken({
      configuredSecret: this.configService.get('FLEET_WEBHOOK_SECRET') as
        | string
        | undefined,
      loggerService: this.loggerService,
      request,
      secretEnvVar: 'FLEET_WEBHOOK_SECRET',
      url,
    });

    this.loggerService.log(`${url} received`, {
      handle: payload.handle,
      jobId: payload.jobId ?? payload.job_id,
      status: payload.status ?? payload.state,
    });

    return await this.fleetWebhookService.handleVoiceCloneCompletion(payload);
  }
}
