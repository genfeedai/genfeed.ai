import { NotificationsService } from '@api/services/notifications/notifications.service';
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
    return [
      '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px">',
      '<h1 style="font-size:20px;margin:0 0 16px">Sign in to Genfeed.ai</h1>',
      '<p style="font-size:14px;color:#444;margin:0 0 24px">Click the button below to sign in. This link expires shortly and can only be used once.</p>',
      `<a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px">Sign in</a>`,
      '<p style="font-size:12px;color:#888;margin:24px 0 0">If you did not request this, you can safely ignore this email.</p>',
      '</div>',
    ].join('');
  }
}
