import { VercelWebhookService } from '@api/endpoints/webhooks/vercel/webhooks.vercel.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import { VercelWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Public()
@Controller('webhooks/vercel')
export class VercelWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly vercelWebhookService: VercelWebhookService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleVercel(@Req() request: Request) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get raw body (Buffer) for signature verification
      const rawBody = request.body as Buffer;
      const signature = request.headers['x-vercel-signature'] as string;

      // Parse the body for logging and processing
      const payload: VercelWebhookPayload = JSON.parse(rawBody.toString());

      this.loggerService.log(`${url} received`, payload);

      // Validate webhook signature using raw body
      const isValid = this.vercelWebhookService.validateSignature(
        rawBody,
        signature,
      );

      if (!isValid) {
        this.loggerService.error(`${url} invalid signature`, { signature });
        throw new UnauthorizedException('Invalid webhook signature');
      }

      await this.vercelWebhookService.handleWebhook(payload);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }

    return { success: true };
  }
}
