import { ChromaticWebhookService } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import { ChromaticWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/chromatic')
export class ChromaticWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly chromaticWebhookService: ChromaticWebhookService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleChromatic(
    @Req() request: Request,
    @Body() payload: ChromaticWebhookPayload,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const signature = request.headers['x-chromatic-signature'] as string;

      this.loggerService.log(`${url} received`, payload);

      // Validate webhook signature using stringified payload
      // (body is already parsed by NestJS, convert back to string for HMAC verification)
      const isValid = this.chromaticWebhookService.validateSignature(
        Buffer.from(JSON.stringify(payload)),
        signature,
      );

      if (!isValid) {
        this.loggerService.error(`${url} invalid signature`, { signature });
        throw new UnauthorizedException('Invalid webhook signature');
      }

      await this.chromaticWebhookService.handleWebhook(payload);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }

    return { success: true };
  }
}
