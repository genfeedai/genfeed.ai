import {
  type FacebookWebhookResult,
  FacebookWebhookService,
} from '@api/collections/social-inbox/services/facebook-webhook.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Facebook Page webhook. Register in the Meta app dashboard (Webhooks, object
 * Page): callback `{API_ORIGIN}/v1/webhooks/facebook`, verify token =
 * INSTAGRAM_WEBHOOK_VERIFY_TOKEN, field `feed`. `main.ts` mounts `express.raw`
 * on this path so the signature is checked against the exact bytes Meta signed.
 */
@ApiTags('Webhooks')
@AutoSwagger()
@Public()
@Controller('webhooks/facebook')
export class FacebookWebhookController {
  constructor(
    private readonly facebookWebhookService: FacebookWebhookService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Facebook webhook subscription handshake' })
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('X-Content-Type-Options', 'nosniff')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    return this.facebookWebhookService.verifyChallenge(
      mode,
      verifyToken,
      challenge,
    );
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Facebook Page comment event intake' })
  async receive(
    @Req() request: Request,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<FacebookWebhookResult & { status: 'accepted' }> {
    const result = await this.facebookWebhookService.receiveEvent(
      request.body,
      signature,
    );

    return { ...result, status: 'accepted' };
  }
}
