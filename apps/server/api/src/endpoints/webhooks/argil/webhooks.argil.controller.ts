import { ArgilWebhookService } from '@api/endpoints/webhooks/argil/webhooks.argil.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ArgilWebhookTokenService } from '@api/services/integrations/argil/services/argil-webhook-token.service';
import { Public } from '@libs/decorators/public.decorator';
import type { ArgilWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('webhooks/argil')
export class ArgilWebhookController {
  constructor(
    private readonly argilWebhookService: ArgilWebhookService,
    private readonly tokenService: ArgilWebhookTokenService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleCallback(
    @Body() body: ArgilWebhookPayload,
    @Query('token') token?: string,
  ) {
    const videoId = body?.data?.videoId;
    if (typeof videoId !== 'string' || videoId.length === 0) {
      throw new BadRequestException('Argil callback requires data.videoId');
    }

    this.tokenService.assert(videoId, token);
    await this.argilWebhookService.handleCallback(body);
    return { detail: 'Webhook received' };
  }
}
