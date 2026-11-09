import { NewsletterPublicService } from '@api/collections/newsletter-sends/services/newsletter-public.service';
import { renderNewsletterNoticePage } from '@api/collections/newsletter-sends/utils/newsletter-notice-page.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Links inside newsletter emails (#9726, #9727): tracked clicks, one-click
 * unsubscribe (RFC 8058), header images and the browser version of an issue.
 */
@AutoSwagger()
@Public()
@Controller('public/newsletter')
export class PublicNewsletterController {
  constructor(private readonly publicNewsletter: NewsletterPublicService) {}

  @Get('c/:token')
  @RateLimit({ limit: 120, scope: 'ip', windowMs: 60_000 })
  async click(
    @Param('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const destination = await this.publicNewsletter.trackClick(token);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(302, destination);
  }

  @Get('unsubscribe/:token')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  unsubscribePage(@Req() request: Request): string {
    return renderNewsletterNoticePage({
      action: { label: 'Unsubscribe', url: request.originalUrl },
      message: 'Stop receiving this newsletter?',
      title: 'Unsubscribe',
    });
  }

  /** Form submit and the one-click `List-Unsubscribe-Post` request. */
  @Post('unsubscribe/:token')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(@Param('token') token: string): Promise<string> {
    const brandLabel = await this.publicNewsletter.unsubscribe(token);
    if (!brandLabel) {
      return renderNewsletterNoticePage({
        message: 'This unsubscribe link is not valid.',
        title: 'Link not valid',
      });
    }
    return renderNewsletterNoticePage({
      message: `You will no longer receive ${brandLabel} by email.`,
      title: 'You are unsubscribed',
    });
  }

  @Get('brands/:brandId/:role')
  async brandImage(
    @Param('brandId') brandId: string,
    @Param('role') role: string,
    @Res() response: Response,
  ): Promise<void> {
    if (role !== 'logo' && role !== 'banner') {
      throw new NotFoundException('Image');
    }
    const url = await this.publicNewsletter.brandAssetUrl(brandId, role);
    // Short cache: the target is a signed URL that expires.
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.redirect(302, url);
  }

  @Get('issues/:newsletterId')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Content-Type', 'text/html; charset=utf-8')
  issuePage(@Param('newsletterId') newsletterId: string): Promise<string> {
    return this.publicNewsletter.renderIssuePage(newsletterId);
  }
}
