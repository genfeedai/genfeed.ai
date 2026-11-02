import {
  type InstagramWebhookResult,
  InstagramWebhookService,
} from '@api/collections/social-inbox/services/instagram-webhook.service';
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
 * Instagram Direct message webhook. Register in the Meta app dashboard
 * (Instagram > Webhooks): callback `{API_ORIGIN}/v1/webhooks/instagram`,
 * verify token = INSTAGRAM_WEBHOOK_VERIFY_TOKEN, field `messages`.
 * `main.ts` mounts `express.raw` on this path so the signature is checked
 * against the exact bytes Meta signed.
 */
@ApiTags('Webhooks')
@AutoSwagger()
@Public()
@Controller('webhooks/instagram')
export class InstagramWebhookController {
  constructor(
    private readonly instagramWebhookService: InstagramWebhookService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Instagram webhook subscription handshake' })
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('X-Content-Type-Options', 'nosniff')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    return this.instagramWebhookService.verifyChallenge(
      mode,
      verifyToken,
      challenge,
    );
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Instagram Direct message event intake' })
  async receive(
    @Req() request: Request,
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<InstagramWebhookResult & { status: 'accepted' }> {
    const result = await this.instagramWebhookService.receiveEvent(
      request.body,
      signature,
    );

    return { ...result, status: 'accepted' };
  }
}
