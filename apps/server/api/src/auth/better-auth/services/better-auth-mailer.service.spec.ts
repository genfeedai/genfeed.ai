import { describe, expect, it, vi } from 'vitest';

import { BetterAuthMailerService } from './better-auth-mailer.service';

describe('BetterAuthMailerService', () => {
  it('sends magic links with the shared Genfeed system email shell', async () => {
    const notificationsService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
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

    expect(notificationsService.sendEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Your Genfeed.ai sign-in link',
      expect.stringContaining('<!doctype html>'),
    );
    const html = notificationsService.sendEmail.mock.calls[0]?.[2] as string;
    expect(html).toContain('Genfeed.ai');
    expect(html).toContain('Sign in to Genfeed.ai');
    expect(html).toContain(
      'https://api.genfeed.ai/v1/auth/magic-link/verify?token=tok&amp;callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F',
    );
    expect(html).toContain('If you did not request this sign-in link');
  });

  it('sends signup magic links with account creation copy', async () => {
    const notificationsService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
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

    expect(notificationsService.sendEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Your Genfeed.ai sign-up link',
      expect.stringContaining('<!doctype html>'),
    );
    const html = notificationsService.sendEmail.mock.calls[0]?.[2] as string;
    expect(html).toContain('Create your Genfeed.ai account');
    expect(html).toContain('Create account');
    expect(html).toContain('If you did not create a Genfeed.ai account');
  });

  it('sends email verification with the shared Genfeed system email shell', async () => {
    const notificationsService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
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

    expect(notificationsService.sendEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Verify your Genfeed.ai email',
      expect.stringContaining('<!doctype html>'),
    );
    const html = notificationsService.sendEmail.mock.calls[0]?.[2] as string;
    expect(html).toContain('Verify your email');
    expect(html).toContain(
      'https://api.genfeed.ai/v1/auth/verify-email?token=verify&amp;callbackURL=https%3A%2F%2Fapp.genfeed.ai%2F',
    );
    expect(html).toContain('If you did not create a Genfeed.ai account');
  });

  it('sends password reset emails through the shared notification pipeline', async () => {
    const notificationsService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { log: vi.fn() };
    const service = new BetterAuthMailerService(
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

    expect(notificationsService.sendEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Reset your Genfeed.ai password',
      expect.stringContaining('<!doctype html>'),
    );
    const html = notificationsService.sendEmail.mock.calls[0]?.[2] as string;
    expect(html).toContain('Reset your password');
    expect(html).toContain('Reset password');
    expect(html).toContain(
      'https://app.genfeed.ai/reset-password?token=reset&amp;callbackUrl=https%3A%2F%2Fapp.genfeed.ai%2F',
    );
    expect(html).toContain(
      'If you did not request a Genfeed.ai password reset',
    );
    expect(logger.log).toHaveBeenCalledWith('Password reset email dispatched', {
      emailDomain: 'example.com',
      service: 'BetterAuthMailerService',
    });
  });
});
