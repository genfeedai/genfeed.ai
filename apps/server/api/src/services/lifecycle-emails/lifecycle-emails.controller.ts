import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { LifecycleEmailDeliveryService } from '@server/services/lifecycle-emails/lifecycle-email-delivery.service';

@Public()
@Controller('lifecycle-emails')
export class LifecycleEmailsController {
  constructor(
    private readonly lifecycleEmailDeliveryService: LifecycleEmailDeliveryService,
  ) {}

  @Get('unsubscribe')
  @ApiQuery({ name: 'token', required: false, type: String })
  @Header('content-type', 'text/html; charset=utf-8')
  async unsubscribe(@Query('token') token?: string): Promise<string> {
    const unsubscribed = token
      ? await this.lifecycleEmailDeliveryService.unsubscribe(token)
      : false;

    const title = unsubscribed ? 'Unsubscribed' : 'Unsubscribe link expired';
    const body = unsubscribed
      ? 'You will no longer receive Genfeed.ai lifecycle emails.'
      : 'This unsubscribe link is invalid or has expired.';

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="background:#050607;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:40px;">
    <main style="max-width:560px;">
      <h1 style="font-size:28px;line-height:34px;margin:0 0 12px;">${title}</h1>
      <p style="color:#b4b4bc;font-size:16px;line-height:24px;margin:0;">${body}</p>
    </main>
  </body>
</html>`;
  }
}
