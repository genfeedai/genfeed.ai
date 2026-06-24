import { NotificationsService } from '@api/services/notifications/notifications.service';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
} from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

import type { IBetterAuthMagicLinkParams } from '../better-auth.types';

/**
 * Delivers Better Auth transactional emails through the existing notifications
 * pipeline (Redis → notifications service → Resend), so first-party auth reuses
 * the established email path rather than introducing a second mailer.
 */
@Injectable()
export class BetterAuthMailerService {
  private readonly context = { service: BetterAuthMailerService.name };

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly logger: LoggerService,
  ) {}

  async sendMagicLink({
    email,
    url,
  }: IBetterAuthMagicLinkParams): Promise<void> {
    const subject = 'Your Genfeed.ai sign-in link';
    const html = this.buildMagicLinkHtml(url);

    await this.notificationsService.sendEmail(email, subject, html);

    // Log delivery without the recipient address (PII) — just the domain.
    this.logger.log('Magic-link email dispatched', {
      ...this.context,
      emailDomain: email.split('@')[1] ?? 'unknown',
    });
  }

  private buildMagicLinkHtml(url: string): string {
    const escapedUrl = escapeSystemEmailHtml(url);

    return buildSystemEmailHtml({
      action: { label: 'Sign in', url },
      bodyHtml: [
        buildSystemEmailParagraph(
          'Click the button below to sign in. This link expires shortly and can only be used once.',
        ),
        '<p style="margin:0 0 10px;color:#8c8c96;font-size:12px;line-height:18px;">If the button does not work, copy and paste this URL into your browser:</p>',
        `<p style="background:#131518;border:1px solid #333538;border-radius:8px;color:#b4b4bc;font-size:12px;line-height:18px;margin:0 0 22px;padding:12px;word-break:break-all;"><a href="${escapedUrl}" style="color:#f4f4f5;text-decoration:underline;">${escapedUrl}</a></p>`,
      ].join(''),
      footerNote:
        'If you did not request this sign-in link, you can safely ignore this email.',
      preheader: 'Use this one-time link to sign in to Genfeed.ai.',
      title: 'Sign in to Genfeed.ai',
    });
  }
}
