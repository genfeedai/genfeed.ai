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
});
