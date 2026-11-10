import { renderNewsletterNoticePage } from '@api/collections/newsletter-sends/utils/newsletter-notice-page.util';
import { PublicSubscribeDto } from '@api/collections/newsletter-subscribers/dto/brand-subscribers.dto';
import { BrandSubscribersService } from '@api/collections/newsletter-subscribers/services/brand-subscribers.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { IPublicNewsletterSubscribeResponse } from '@genfeedai/contracts/interfaces';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

/** Public subscribe form and double opt-in confirmation (#9665). */
@AutoSwagger()
@Public()
@Controller('public/newsletter')
export class PublicNewsletterSubscribeController {
  constructor(private readonly subscribers: BrandSubscribersService) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 10, scope: 'ip', windowMs: 60_000 })
  @Header('Cache-Control', 'no-store')
  async subscribe(
    @Req() request: Request,
    @Body() dto: PublicSubscribeDto,
  ): Promise<{ data: IPublicNewsletterSubscribeResponse }> {
    await this.subscribers.subscribePublic(dto, request.ip ?? null);
    return { data: { status: 'confirmation_sent' } };
  }

  /**
   * The emailed link shows a confirm button; only the POST activates the
   * subscriber, so mail scanners that prefetch the GET subscribe nobody.
   */
  @Get('confirm/:token')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  confirmPage(@Req() request: Request): string {
    return renderNewsletterNoticePage({
      action: { label: 'Confirm subscription', url: request.originalUrl },
      message: 'Confirm that you want to get this newsletter by email.',
      title: 'Confirm your subscription',
    });
  }

  @Post('confirm/:token')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async confirm(@Param('token') token: string): Promise<string> {
    const result = await this.subscribers.confirm(token);
    if (!result) {
      return renderNewsletterNoticePage({
        message:
          'This confirmation link has expired or was already used. Subscribe again to get a new one.',
        title: 'Link not valid',
      });
    }
    if (result.isListFull) {
      return renderNewsletterNoticePage({
        message: `${result.brandLabel} is not taking new subscribers right now. Try this link again later.`,
        title: 'List is full',
      });
    }
    return renderNewsletterNoticePage({
      message: `You will now receive ${result.brandLabel} by email.`,
      title: 'You are subscribed',
    });
  }
}
