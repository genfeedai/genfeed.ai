import { ConfigService } from '@api/config/config.service';
import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import type { CiTriagePayload } from './ci-triage-webhook.service';
import { CiTriageWebhookService } from './ci-triage-webhook.service';

@Controller('webhooks/ci-triage')
export class CiTriageWebhookController {
  constructor(
    private readonly ciTriageService: CiTriageWebhookService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async handleCiFailure(
    @Body() payload: CiTriagePayload,
    @Headers('x-webhook-secret') secret: string,
  ): Promise<{ status: string }> {
    const expectedSecret = this.configService.get<string>(
      'CI_TRIAGE_WEBHOOK_SECRET',
    );

    if (!expectedSecret || secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    // Fire and forget — respond immediately, diagnose in background
    void this.ciTriageService.diagnoseAndComment(payload);
    return { status: 'accepted' };
  }
}
