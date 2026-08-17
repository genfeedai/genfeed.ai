import { describe, expect, it, vi } from 'vitest';

import {
  BetterAuthMailerService,
  buildAuthLinkCorrelationId,
} from './better-auth-mailer.service';

const LINK_ID_PATTERN = /^[a-f0-9]{12}$/;

describe('BetterAuthMailerService', () => {
  it('sends magic links with the shared Genfeed system email shell', async () => {
    const notificationsService = {
      deliverEmail: vi.fn().mockResolvedValue('email_123'),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: false,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );
    const url =
      'https://api.genfeed.ai/v1/auth/magic-link/verify?token=tok&callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F';

    await service.sendMagicLink({
      email: 'user@example.com',
      token: 'tok',
      url,
    });

    expect(notificationsService.deliverEmail).toHaveBeenCalledWith({
      html: expect.stringContaining('<!doctype html>'),
      idempotencyKey: `auth/magic-link/${buildAuthLinkCorrelationId('tok')}`,
      subject: 'Your Genfeed.ai sign-in link',
      to: 'user@example.com',
    });
    const html = notificationsService.deliverEmail.mock.calls[0]?.[0]
      .html as string;
    expect(html).toContain('Genfeed.ai');
    expect(html).toContain('Sign in to Genfeed.ai');
    expect(html).toContain(
      'https://app.genfeed.ai/v1/auth/magic-link/verify?token=tok&amp;callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F',
    );
    expect(html).toContain('If you did not request this sign-in link');
  });

  it('sends signup magic links with account creation copy', async () => {
    const notificationsService = {
      deliverEmail: vi.fn().mockResolvedValue('email_123'),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: false,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );
    const url =
      'https://api.genfeed.ai/v1/auth/magic-link/verify?token=tok&callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F';

    await service.sendMagicLink({
      email: 'user@example.com',
      metadata: { intent: 'signup' },
      token: 'tok',
      url,
    });

    expect(notificationsService.deliverEmail).toHaveBeenCalledWith({
      html: expect.stringContaining('<!doctype html>'),
      idempotencyKey: `auth/magic-link/${buildAuthLinkCorrelationId('tok')}`,
      subject: 'Your Genfeed.ai sign-up link',
      to: 'user@example.com',
    });
    const html = notificationsService.deliverEmail.mock.calls[0]?.[0]
      .html as string;
    expect(html).toContain('Create your Genfeed.ai account');
    expect(html).toContain('Create account');
    expect(html).toContain('If you did not create a Genfeed.ai account');
  });

  it('sends email verification with the shared Genfeed system email shell', async () => {
    const notificationsService = {
      deliverEmail: vi.fn().mockResolvedValue('email_123'),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: false,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );
    const url =
      'https://api.genfeed.ai/v1/auth/verify-email?token=verify&callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F';

    await service.sendVerificationEmail({
      token: 'verify',
      url,
      user: { email: 'user@example.com' },
    });

    expect(notificationsService.deliverEmail).toHaveBeenCalledWith({
      html: expect.stringContaining('<!doctype html>'),
      idempotencyKey: `auth/verification/${buildAuthLinkCorrelationId('verify')}`,
      subject: 'Verify your Genfeed.ai email',
      to: 'user@example.com',
    });
    const html = notificationsService.deliverEmail.mock.calls[0]?.[0]
      .html as string;
    expect(html).toContain('Verify your email');
    expect(html).toContain(
      'https://app.genfeed.ai/v1/auth/verify-email?token=verify&amp;callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F',
    );
    expect(html).toContain('If you did not create a Genfeed.ai account');
  });

  it('sends password reset emails through the shared notification pipeline', async () => {
    const notificationsService = {
      deliverEmail: vi.fn().mockResolvedValue('email_123'),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: false,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );
    const url =
      'https://app.genfeed.ai/reset-password?token=reset&callbackUrl=https%3A%2F%2Fapp.genfeed.ai%2F';

    await service.sendResetPassword({
      token: 'reset',
      url,
      user: { email: 'user@example.com' },
    });

    expect(notificationsService.deliverEmail).toHaveBeenCalledWith({
      html: expect.stringContaining('<!doctype html>'),
      idempotencyKey: `auth/password-reset/${buildAuthLinkCorrelationId('reset')}`,
      subject: 'Reset your Genfeed.ai password',
      to: 'user@example.com',
    });
    const html = notificationsService.deliverEmail.mock.calls[0]?.[0]
      .html as string;
    expect(html).toContain('Reset your password');
    expect(html).toContain('Reset password');
    expect(html).toContain(
      'https://app.genfeed.ai/reset-password?token=reset&amp;callbackUrl=https%3A%2F%2Fapp.genfeed.ai%2F',
    );
    expect(html).toContain(
      'If you did not request a Genfeed.ai password reset',
    );
    expect(logger.log).toHaveBeenCalledWith('Password reset email accepted', {
      emailDomain: 'example.com',
      linkId: expect.stringMatching(LINK_ID_PATTERN),
      service: 'BetterAuthMailerService',
    });
  });

  // #2700 — the action URL carries a bearer-style token. `NODE_ENV=development`
  // is not a privacy boundary: dev logs still flow through file and shared
  // console transports, so the token must not reach the logger there either.
  it('never logs the magic-link URL or its token, even in development', async () => {
    const notificationsService = {
      deliverEmail: vi.fn().mockResolvedValue('email_123'),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: true,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );
    const secret = 'magic-secret-9f3b7c';
    const url = `https://api.genfeed.ai/v1/auth/magic-link/verify?token=${secret}&callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F`;

    await service.sendMagicLink({
      email: 'user@example.com',
      token: secret,
      url,
    });

    // The email itself still carries the link — only the log must not.
    expect(notificationsService.deliverEmail).toHaveBeenCalledTimes(1);

    const logged = JSON.stringify(logger.log.mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('magic-link/verify');
    expect(logged).not.toContain('user@example.com');
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith('Magic-link email accepted', {
      emailDomain: 'example.com',
      linkId: expect.stringMatching(LINK_ID_PATTERN),
      service: 'BetterAuthMailerService',
    });
  });

  it('never logs the password-reset URL or its token, even in development', async () => {
    const notificationsService = {
      deliverEmail: vi.fn().mockResolvedValue('email_123'),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: true,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );
    const secret = 'reset-secret-4d81ae';
    const url = `https://app.genfeed.ai/reset-password?token=${secret}&callbackUrl=https%3A%2F%2Fapp.genfeed.ai%2F`;

    await service.sendResetPassword({
      token: secret,
      url,
      user: { email: 'user@example.com' },
    });

    expect(notificationsService.deliverEmail).toHaveBeenCalledTimes(1);

    const logged = JSON.stringify(logger.log.mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('reset-password');
    expect(logged).not.toContain('user@example.com');
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('never logs the verification URL or its token', async () => {
    const notificationsService = {
      deliverEmail: vi.fn().mockResolvedValue('email_123'),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: true,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );
    const secret = 'verify-secret-77c2f0';

    await service.sendVerificationEmail({
      token: secret,
      url: `https://api.genfeed.ai/v1/auth/verify-email?token=${secret}`,
      user: { email: 'user@example.com' },
    });

    const logged = JSON.stringify(logger.log.mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('verify-email');
    expect(logged).not.toContain('user@example.com');
    expect(logger.log).toHaveBeenCalledWith('Verification email accepted', {
      emailDomain: 'example.com',
      linkId: expect.stringMatching(LINK_ID_PATTERN),
      service: 'BetterAuthMailerService',
    });
  });

  it('propagates provider rejection and does not report acceptance', async () => {
    const deliveryError = new Error('Auth email delivery failed');
    const notificationsService = {
      deliverEmail: vi.fn().mockRejectedValue(deliveryError),
    };
    const configService = {
      get: vi.fn().mockReturnValue('https://app.genfeed.ai'),
      isDevelopment: false,
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
      configService as never,
      notificationsService as never,
      logger as never,
    );

    await expect(
      service.sendMagicLink({
        email: 'user@example.com',
        token: 'rejected-token',
        url: 'https://api.genfeed.ai/v1/auth/magic-link/verify?token=rejected-token',
      }),
    ).rejects.toBe(deliveryError);

    expect(logger.log).not.toHaveBeenCalled();
  });
});

describe('buildAuthLinkCorrelationId', () => {
  it('derives a stable, non-reversible short id from the token', () => {
    const token = 'magic-secret-9f3b7c';
    const linkId = buildAuthLinkCorrelationId(token);

    expect(linkId).toMatch(LINK_ID_PATTERN);
    expect(linkId).toBe(buildAuthLinkCorrelationId(token));
    expect(linkId).not.toContain(token);
    expect(token).not.toContain(linkId);
  });

  it('distinguishes separate issuances', () => {
    expect(buildAuthLinkCorrelationId('token-a')).not.toBe(
      buildAuthLinkCorrelationId('token-b'),
    );
  });
});
