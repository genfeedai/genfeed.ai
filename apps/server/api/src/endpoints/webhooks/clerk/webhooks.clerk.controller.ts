import { ConfigService } from '@api/config/config.service';
import { ClerkWebhookService } from '@api/endpoints/webhooks/clerk/webhooks.clerk.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import type { WebhookEvent } from '@clerk/backend';
import { IS_LOCAL_MODE } from '@genfeedai/config';
import { Public } from '@libs/decorators/public.decorator';
import { ClerkWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'svix';

@AutoSwagger()
@Public()
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly clerkWebhookService: ClerkWebhookService,
  ) {}

  @HttpCode(200)
  @Post('callback')
  async handleClerk(
    @Req() request: Request,
    @Body() payload: ClerkWebhookPayload,
  ) {
    if (IS_LOCAL_MODE) throw new NotFoundException();

    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} received`, payload);

      const headers = request.headers;

      // Get the Svix headers for verification
      const svixId = headers['svix-id'] as string;
      const svixTimestamp = headers['svix-timestamp'] as string;
      const svixSignature = headers['svix-signature'] as string;

      // If there are no Svix headers, error out
      if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response('Error occured -- no svix headers', {
          status: 400,
        });
      }

      // Create a new Svix instance with your secret.
      const webhook = new Webhook(
        this.configService.get('CLERK_WEBHOOK_SIGNING_SECRET')!,
      );

      // Verify webhook signature and process event
      const event = webhook.verify(JSON.stringify(payload), {
        'svix-id': svixId,
        'svix-signature': svixSignature,
        'svix-timestamp': svixTimestamp,
      }) as WebhookEvent;

      await this.clerkWebhookService.handleWebhookEvent(event, url);

      return { message: 'Webhook processed successfully', success: true };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
