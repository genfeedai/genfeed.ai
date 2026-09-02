import { LifecycleEmailDeliveryService } from '@api/services/lifecycle-emails/lifecycle-email-delivery.service';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

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
    <style>
      :root {
        color-scheme: light dark;
        --page-background:#fafaf9;
        --page-foreground:#0d0d0d;
        --page-muted:#707070;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --page-background:#030303;
          --page-foreground:#fafafa;
          --page-muted:#949494;
        }
      }
      * { box-sizing:border-box; }
      body {
        min-height:100vh;
        margin:0;
        background:var(--page-background);
        color:var(--page-foreground);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
        padding:clamp(24px,6vw,64px);
      }
      main { max-width:560px; }
      h1 { margin:0 0 12px;font-size:clamp(28px,6vw,40px);line-height:1.2; }
      p { margin:0;color:var(--page-muted);font-size:16px;line-height:1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${body}</p>
    </main>
  </body>
</html>`;
  }
}
