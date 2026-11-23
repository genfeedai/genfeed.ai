import { EmailMediaUrlService } from '@api/services/email-media/email-media-url.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Header, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

/** The stable image link inside an email; see `EmailMediaUrlService`. */
@Public()
@Controller('email-media')
@UseGuards(RateLimitGuard)
export class EmailMediaController {
  constructor(private readonly media: EmailMediaUrlService) {}

  @Get(':token')
  @RateLimit({ limit: 300, scope: 'ip', windowMs: 60_000 })
  // The redirect target is signed for minutes; a cached redirect must not outlive it.
  @Header('Cache-Control', 'private, max-age=300')
  async preview(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(302, await this.media.resolve(token));
  }
}
