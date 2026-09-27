import { ServerFunnelCaptureService } from '@api/services/analytics/server-funnel-capture.service';
import type { ConfigService } from '@libs/config/config.service';
import { safeFetch } from '@libs/security/destination-guard';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));
vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

const SECRET_PROJECT_KEY = 'phc_test_key';
const SECRET_MARKER = 'super-secret-rollout-plan';

describe('ServerFunnelCaptureService (genfeedai/genfeed.ai#4969)', () => {
  let configService: { get: ReturnType<typeof vi.fn> };
  let logger: { warn: ReturnType<typeof vi.fn> };
  let service: ServerFunnelCaptureService;

  function mockConfig(overrides: Record<string, string | undefined> = {}) {
    configService.get.mockImplementation((key: string) => {
      if (key in overrides) return overrides[key];
      if (key === 'POSTHOG_PROJECT_API_KEY') return SECRET_PROJECT_KEY;
      return undefined;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    configService = { get: vi.fn() };
    mockConfig();
    logger = { warn: vi.fn() };
    vi.mocked(safeFetch).mockResolvedValue({ ok: true, status: 200 } as never);

    service = new ServerFunnelCaptureService(
      configService as unknown as ConfigService,
      logger as never,
    );
  });

  it('posts the event to the PostHog capture endpoint with the configured project key', async () => {
    await service.capture({
      distinctId: 'org_1',
      event: 'first_successful_publish',
      properties: { platform: 'x' },
    });

    expect(safeFetch).toHaveBeenCalledTimes(1);
    const [url, init, options] = vi.mocked(safeFetch).mock.calls[0];
    expect(String(url)).toBe('https://eu.i.posthog.com/i/v0/e/');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      api_key: SECRET_PROJECT_KEY,
      distinct_id: 'org_1',
      event: 'first_successful_publish',
      properties: { platform: 'x' },
    });
    // Never follow a redirect: a same-origin 3xx must not silently turn the
    // POST into a bodyless GET that reports success.
    expect(init?.redirect).toBe('manual');
    // Defense-in-depth: the destination guard itself is told to reject
    // anything but HTTPS, including a plaintext redirect target.
    expect(options).toMatchObject({ allowedSchemes: ['https:'] });
  });

  it('strips exactly one trailing slash from an explicitly configured HTTPS host', async () => {
    mockConfig({ POSTHOG_HOST: 'https://posthog.example.com/' });

    await service.capture({
      distinctId: 'org_1',
      event: 'onboarding_completed',
    });

    const [url] = vi.mocked(safeFetch).mock.calls[0];
    expect(String(url)).toBe('https://posthog.example.com/i/v0/e/');
  });

  it('no-ops without calling PostHog when no project key is configured', async () => {
    mockConfig({ POSTHOG_PROJECT_API_KEY: undefined });

    await service.capture({
      distinctId: 'org_1',
      event: 'onboarding_completed',
    });

    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('no-ops when the distinct id is empty', async () => {
    await service.capture({ distinctId: '', event: 'onboarding_completed' });

    expect(safeFetch).not.toHaveBeenCalled();
  });

  describe('POSTHOG_HOST validation (genfeedai/genfeed.ai#5314)', () => {
    it('rejects the capture without sending it when POSTHOG_HOST is HTTP', async () => {
      mockConfig({ POSTHOG_HOST: 'http://insecure.example.com' });

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(safeFetch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toMatchObject({ category: 'invalid_destination' });
    });

    it('rejects the capture without sending it when POSTHOG_HOST is not a valid URL', async () => {
      mockConfig({ POSTHOG_HOST: 'not a url' });

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(safeFetch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });

    it('rejects an explicit POSTHOG_HOST of "/" instead of falling back to the default', async () => {
      mockConfig({ POSTHOG_HOST: '/' });

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(safeFetch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toMatchObject({ category: 'invalid_destination' });
    });

    it('rejects an explicit whitespace-only POSTHOG_HOST instead of falling back to the default', async () => {
      mockConfig({ POSTHOG_HOST: '   ' });

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(safeFetch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toMatchObject({ category: 'invalid_destination' });
    });

    it('falls back to the public default only when POSTHOG_HOST is absent', async () => {
      mockConfig({ POSTHOG_HOST: undefined });

      await service.capture({
        distinctId: 'org_1',
        event: 'onboarding_completed',
      });

      expect(safeFetch).toHaveBeenCalledTimes(1);
      const [url] = vi.mocked(safeFetch).mock.calls[0];
      expect(String(url)).toBe('https://eu.i.posthog.com/i/v0/e/');
    });

    it('falls back to the public default when POSTHOG_HOST is explicitly empty', async () => {
      mockConfig({ POSTHOG_HOST: '' });

      await service.capture({
        distinctId: 'org_1',
        event: 'onboarding_completed',
      });

      expect(safeFetch).toHaveBeenCalledTimes(1);
      const [url] = vi.mocked(safeFetch).mock.calls[0];
      expect(String(url)).toBe('https://eu.i.posthog.com/i/v0/e/');
    });
  });

  describe('response and redirect handling', () => {
    it('records a bounded failure signal for a non-2xx capture response without throwing', async () => {
      vi.mocked(safeFetch).mockResolvedValue({
        ok: false,
        status: 429,
      } as never);

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toMatchObject({
        category: 'non_2xx_response',
        status: 429,
      });

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const [, sentryContext] = vi.mocked(Sentry.captureException).mock
        .calls[0];
      expect(sentryContext?.extra).toMatchObject({
        category: 'non_2xx_response',
        status: 429,
      });
    });

    it('records a bounded failure signal for a 5xx capture response without throwing', async () => {
      vi.mocked(safeFetch).mockResolvedValue({
        ok: false,
        status: 503,
      } as never);

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toMatchObject({ status: 503 });
    });

    it('treats an unfollowed 3xx redirect as a failure and never issues a second request', async () => {
      // safeFetch is called with redirect: 'manual', so destination-guard
      // returns the 3xx response as-is instead of following it — asserted
      // separately in destination-guard.spec.ts ("returns redirect
      // responses untouched in manual redirect mode", which proves only one
      // underlying request is issued).
      vi.mocked(safeFetch).mockResolvedValue({
        ok: false,
        status: 302,
      } as never);

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(safeFetch).toHaveBeenCalledTimes(1);
      const [, init] = vi.mocked(safeFetch).mock.calls[0];
      expect(init?.redirect).toBe('manual');
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toMatchObject({
        category: 'non_2xx_response',
        status: 302,
      });
    });

    it('does not report a failure for a 2xx capture response', async () => {
      vi.mocked(safeFetch).mockResolvedValue({
        ok: true,
        status: 202,
      } as never);

      await service.capture({
        distinctId: 'org_1',
        event: 'onboarding_completed',
      });

      expect(logger.warn).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('never throws when the PostHog request fails (e.g. timeout), and reports it to Sentry', async () => {
      vi.mocked(safeFetch).mockRejectedValue(
        new DOMException('The operation was aborted', 'TimeoutError'),
      );

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toMatchObject({ category: 'request_failed' });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure-report redaction (genfeedai/genfeed.ai#5314)', () => {
    it('never attaches the original exception, and never leaks its message, the project key, or event properties', async () => {
      // The rejected error's message deliberately embeds both the project
      // key and a payload marker (mirroring, e.g., destination-guard.ts
      // embedding an echoed redirect Location in its error message) to
      // prove the service never forwards it. JSON.stringify(Error) drops
      // `message` (a non-enumerable own property), so assertions inspect
      // the actual call arguments and their `.message` directly rather than
      // stringifying the call — a stringify-based check would pass even if
      // the raw Error object leaked through untouched.
      const leakyError = new Error(
        `upstream echoed api_key=${SECRET_PROJECT_KEY}&payload=${SECRET_MARKER}`,
      );
      vi.mocked(safeFetch).mockRejectedValue(leakyError);

      await service.capture({
        distinctId: 'org_1',
        event: 'onboarding_completed',
        properties: { secretPlan: SECRET_MARKER },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [logMessage, logContext] = logger.warn.mock.calls[0];
      expect(logMessage).not.toContain(SECRET_PROJECT_KEY);
      expect(logMessage).not.toContain(SECRET_MARKER);
      expect(JSON.stringify(logContext)).not.toContain(SECRET_PROJECT_KEY);
      expect(JSON.stringify(logContext)).not.toContain(SECRET_MARKER);
      expect(logContext).not.toHaveProperty('error');
      expect(logContext).not.toHaveProperty('properties');

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      const [sentryErrorArg, sentryOptions] = vi.mocked(Sentry.captureException)
        .mock.calls[0];
      // The exact object passed to Sentry must not be the original
      // exception, and its own message must not carry the leak either.
      expect(sentryErrorArg).not.toBe(leakyError);
      expect(sentryErrorArg).toBeInstanceOf(Error);
      expect((sentryErrorArg as Error).message).not.toContain(
        SECRET_PROJECT_KEY,
      );
      expect((sentryErrorArg as Error).message).not.toContain(SECRET_MARKER);
      expect(JSON.stringify(sentryOptions?.extra)).not.toContain(
        SECRET_PROJECT_KEY,
      );
      expect(JSON.stringify(sentryOptions?.extra)).not.toContain(SECRET_MARKER);
      expect(sentryOptions?.extra).not.toHaveProperty('properties');
    });

    it('never leaks the project key when POSTHOG_HOST validation itself fails', async () => {
      mockConfig({ POSTHOG_HOST: 'http://insecure.example.com' });

      await service.capture({
        distinctId: 'org_1',
        event: 'onboarding_completed',
      });

      const [logMessage, logContext] = logger.warn.mock.calls[0];
      expect(logMessage).not.toContain(SECRET_PROJECT_KEY);
      expect(JSON.stringify(logContext)).not.toContain(SECRET_PROJECT_KEY);

      const [sentryErrorArg, sentryOptions] = vi.mocked(Sentry.captureException)
        .mock.calls[0];
      expect((sentryErrorArg as Error).message).not.toContain(
        SECRET_PROJECT_KEY,
      );
      expect(JSON.stringify(sentryOptions?.extra)).not.toContain(
        SECRET_PROJECT_KEY,
      );
    });
  });
});
