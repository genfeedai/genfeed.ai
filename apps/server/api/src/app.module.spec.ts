// Ensure environment variables are set before importing
import process from 'node:process';

process.env.SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || 'test';
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN || 'https://test@sentry.io/test';

describe('AppModule (API)', () => {
  it.skip('still cannot be asserted reliably under bun because module import may hang instead of rejecting', async () => {
    await expect(import('@api/app.module')).rejects.toThrow(
      /Announcement\.isDeleted/,
    );
  });
});
