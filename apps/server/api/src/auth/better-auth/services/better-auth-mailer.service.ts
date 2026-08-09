import { createHash } from 'node:crypto';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
  sanitizeSystemEmailUrl,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

import type {
  IBetterAuthMagicLinkParams,
  IBetterAuthResetPasswordParams,
  IBetterAuthVerificationEmailParams,
} from '../better-auth.types';

export function resolveBrowserAuthActionUrl(
  actionUrl: string,
  appUrl: string | undefined,
): string {
  if (!appUrl) {
    return actionUrl;
  }

  try {
    const action = new URL(actionUrl);
    const app = new URL(appUrl);
    const supportedProtocols = new Set(['http:', 'https:']);
    if (
      !supportedProtocols.has(action.protocol) ||
      !supportedProtocols.has(app.protocol)
    ) {
      return actionUrl;
    }

    action.protocol = app.protocol;
    action.host = app.host;
    return action.toString();
  } catch {
    return actionUrl;
  }
}

const AUTH_LINK_CORRELATION_ID_LENGTH = 12;

/**
 * One-way correlation id for a delivered auth link.
 *
 * The plaintext token in a magic-link / reset URL is a bearer credential —
 * whoever reads it can complete the action. It must therefore never reach a log
 * sink, including under `NODE_ENV=development`: dev logs still flow through file
 * and shared console transports, so "development" is not a privacy boundary.
 * A truncated SHA-256 digest keeps the only thing operators actually need — the
 * ability to tie a delivery log line to one specific issuance — while being
 * useless as a credential and non-reversible back to the token.
 */
export function buildAuthLinkCorrelationId(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex')
    .slice(0, AUTH_LINK_CORRELATION_ID_LENGTH);
}

/**
 * Delivers Better Auth transactional emails through the existing notifications
 * pipeline (Redis → notifications service → Resend), so first-party auth reuses
 * the established email path rather than introducing a second mailer.
 */
@Injectable()
export class BetterAuthMailerService {
  private readonly context = { service: BetterAuthMailerService.name };

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly logger: LoggerService,
  ) {}

  async sendMagicLink({
    email,
    metadata,
    token,
    url,
  }: IBetterAuthMagicLinkParams): Promise<void> {
    const purpose = metadata?.intent === 'signup' ? 'sign-up' : 'sign-in';
    const actionUrl = this.resolveActionUrl(url);
    const subject =
      purpose === 'sign-up'
        ? 'Your Genfeed.ai sign-up link'
        : 'Your Genfeed.ai sign-in link';
    const html = this.buildMagicLinkHtml(actionUrl, purpose);

    await this.notificationsService.sendEmail(email, subject, html);

    // Log delivery without the recipient address (PII) — just the domain — and
    // without the action URL, which carries the bearer token.
    this.logger.log('Magic-link email dispatched', {
      ...this.context,
      emailDomain: email.split('@')[1] ?? 'unknown',
      linkId: buildAuthLinkCorrelationId(token),
    });
  }

  async sendVerificationEmail({
    token,
    url,
    user,
  }: IBetterAuthVerificationEmailParams): Promise<void> {
    const subject = 'Verify your Genfeed.ai email';
    const html = this.buildVerificationEmailHtml(this.resolveActionUrl(url));

    await this.notificationsService.sendEmail(user.email, subject, html);

    this.logger.log('Verification email dispatched', {
      ...this.context,
      emailDomain: user.email.split('@')[1] ?? 'unknown',
      linkId: buildAuthLinkCorrelationId(token),
    });
  }

  async sendResetPassword({
    token,
    url,
    user,
  }: IBetterAuthResetPasswordParams): Promise<void> {
    const subject = 'Reset your Genfeed.ai password';
    const actionUrl = this.resolveActionUrl(url);
    const html = this.buildResetPasswordHtml(actionUrl);

    await this.notificationsService.sendEmail(user.email, subject, html);

    this.logger.log('Password reset email dispatched', {
      ...this.context,
      emailDomain: user.email.split('@')[1] ?? 'unknown',
      linkId: buildAuthLinkCorrelationId(token),
    });
  }

  private resolveActionUrl(url: string): string {
    return resolveBrowserAuthActionUrl(
      url,
      this.configService.get('GENFEEDAI_APP_URL'),
    );
  }

  /**
   * Renders the "copy and paste this URL" fallback, but only for schemes we
   * trust. Escaping alone closes attribute breakout while leaving a
   * `javascript:` or `data:text/html` target perfectly functional inside the
   * `href`, so the scheme check is what makes this raw interpolation safe.
   * An untrusted target renders nothing rather than a poisoned link.
   */
  private buildUrlFallbackBlock(url: string): string {
    const safeUrl = sanitizeSystemEmailUrl(url);

    if (!safeUrl) {
      return '';
    }

    const escapedUrl = escapeSystemEmailHtml(safeUrl);

    return [
      '<p style="margin:0 0 10px;color:#8c8c96;font-size:12px;line-height:18px;">If the button does not work, copy and paste this URL into your browser:</p>',
      `<p style="background:#131518;border:1px solid #333538;border-radius:8px;color:#b4b4bc;font-size:12px;line-height:18px;margin:0 0 22px;padding:12px;word-break:break-all;"><a href="${escapedUrl}" style="color:#f4f4f5;text-decoration:underline;">${escapedUrl}</a></p>`,
    ].join('');
  }

  private buildMagicLinkHtml(
    url: string,
    purpose: 'sign-in' | 'sign-up',
  ): string {
    const isSignUp = purpose === 'sign-up';

    return buildSystemEmailHtml({
      action: { label: isSignUp ? 'Create account' : 'Sign in', url },
      bodyHtml: [
        buildSystemEmailParagraph(
          isSignUp
            ? 'Click the button below to create your account. This link expires shortly and can only be used once.'
            : 'Click the button below to sign in. This link expires shortly and can only be used once.',
        ),
        this.buildUrlFallbackBlock(url),
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
    return buildSystemEmailHtml({
      action: { label: 'Verify email', url },
      bodyHtml: [
        buildSystemEmailParagraph(
          'Click the button below to verify your email address and finish securing your Genfeed.ai account.',
        ),
        this.buildUrlFallbackBlock(url),
      ].join(''),
      footerNote:
        'If you did not create a Genfeed.ai account, you can safely ignore this email.',
      preheader: 'Verify your email address for Genfeed.ai.',
      title: 'Verify your email',
    });
  }

  private buildResetPasswordHtml(url: string): string {
    return buildSystemEmailHtml({
      action: { label: 'Reset password', url },
      bodyHtml: [
        buildSystemEmailParagraph(
          'Click the button below to choose a new Genfeed.ai password. This link expires shortly and can only be used once.',
        ),
        this.buildUrlFallbackBlock(url),
      ].join(''),
      footerNote:
        'If you did not request a Genfeed.ai password reset, you can safely ignore this email.',
      preheader: 'Choose a new password for your Genfeed.ai account.',
      title: 'Reset your password',
    });
  }
}
