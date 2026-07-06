import { NotificationsService } from '@api/services/notifications/notifications.service';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
} from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

import type {
  IBetterAuthMagicLinkParams,
  IBetterAuthVerificationEmailParams,
} from '../better-auth.types';

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
    metadata,
    url,
  }: IBetterAuthMagicLinkParams): Promise<void> {
    const purpose = metadata?.intent === 'signup' ? 'sign-up' : 'sign-in';
    const subject =
      purpose === 'sign-up'
        ? 'Your Genfeed.ai sign-up link'
        : 'Your Genfeed.ai sign-in link';
    const html = this.buildMagicLinkHtml(url, purpose);

    await this.notificationsService.sendEmail(email, subject, html);

    // Log delivery without the recipient address (PII) — just the domain.
    this.logger.log('Magic-link email dispatched', {
      ...this.context,
      emailDomain: email.split('@')[1] ?? 'unknown',
    });
  }

  async sendVerificationEmail({
    url,
    user,
  }: IBetterAuthVerificationEmailParams): Promise<void> {
    const subject = 'Verify your Genfeed.ai email';
    const html = this.buildVerificationEmailHtml(url);

    await this.notificationsService.sendEmail(user.email, subject, html);

    this.logger.log('Verification email dispatched', {
      ...this.context,
      emailDomain: user.email.split('@')[1] ?? 'unknown',
    });
  }

  private buildMagicLinkHtml(
    url: string,
    purpose: 'sign-in' | 'sign-up',
  ): string {
    const escapedUrl = escapeSystemEmailHtml(url);
    const isSignUp = purpose === 'sign-up';

    return buildSystemEmailHtml({
      action: { label: isSignUp ? 'Create account' : 'Sign in', url },
      bodyHtml: [
        buildSystemEmailParagraph(
          isSignUp
            ? 'Click the button below to create your account. This link expires shortly and can only be used once.'
            : 'Click the button below to sign in. This link expires shortly and can only be used once.',
        ),
        '<p style="margin:0 0 10px;color:#8c8c96;font-size:12px;line-height:18px;">If the button does not work, copy and paste this URL into your browser:</p>',
        `<p style="background:#131518;border:1px solid #333538;border-radius:8px;color:#b4b4bc;font-size:12px;line-height:18px;margin:0 0 22px;padding:12px;word-break:break-all;"><a href="${escapedUrl}" style="color:#f4f4f5;text-decoration:underline;">${escapedUrl}</a></p>`,
      ].join(''),
      footerNote: isSignUp
        ? 'If you did not create a Genfeed.ai account, you can safely ignore this email.'
        : 'If you did not request this sign-in link, you can safely ignore this email.',
      preheader: isSignUp
        ? 'Use this one-time link to create your Genfeed.ai account.'
        : 'Use this one-time link to sign in to Genfeed.ai.',
      title: isSignUp
        ? 'Create your Genfeed.ai account'
        : 'Sign in to Genfeed.ai',
    });
  }

  private buildVerificationEmailHtml(url: string): string {
    const escapedUrl = escapeSystemEmailHtml(url);

    return buildSystemEmailHtml({
      action: { label: 'Verify email', url },
      bodyHtml: [
        buildSystemEmailParagraph(
          'Click the button below to verify your email address and finish securing your Genfeed.ai account.',
        ),
        '<p style="margin:0 0 10px;color:#8c8c96;font-size:12px;line-height:18px;">If the button does not work, copy and paste this URL into your browser:</p>',
        `<p style="background:#131518;border:1px solid #333538;border-radius:8px;color:#b4b4bc;font-size:12px;line-height:18px;margin:0 0 22px;padding:12px;word-break:break-all;"><a href="${escapedUrl}" style="color:#f4f4f5;text-decoration:underline;">${escapedUrl}</a></p>`,
      ].join(''),
      footerNote:
        'If you did not create a Genfeed.ai account, you can safely ignore this email.',
      preheader: 'Verify your email address for Genfeed.ai.',
      title: 'Verify your email',
    });
  }
}
