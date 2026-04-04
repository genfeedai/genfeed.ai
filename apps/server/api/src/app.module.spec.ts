// Ensure environment variables are set before importing
process.env.SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || 'test';
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN || 'https://test@sentry.io/test';

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(),
  verifyToken: vi.fn(),
}));

describe('AppModule (API)', () => {
  it.skip('still cannot be asserted reliably under bun because module import may hang instead of rejecting', async () => {
    await expect(import('@api/app.module')).rejects.toThrow(
      /createClerkClient|Announcement\.isDeleted/,
    );
  });
});
