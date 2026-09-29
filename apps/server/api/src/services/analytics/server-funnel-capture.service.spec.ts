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
// Matches CAPTURE_TIMEOUT_MS in server-funnel-capture.service.ts.
const CAPTURE_TIMEOUT_MS = 800;

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

  describe('capture timeout', () => {
    it('wires the fetch signal to the configured capture timeout and aborts it at the deadline', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      let capturedSignal: AbortSignal | undefined;
      vi.mocked(safeFetch).mockImplementation(async (_url, init) => {
        capturedSignal = init?.signal as AbortSignal | undefined;
        return { ok: true, status: 200 } as never;
      });

      const capturePromise = service.capture({
        distinctId: 'org_1',
        event: 'onboarding_completed',
      });

      // Proves the signal is built from the service's own deadline constant
      // (not, e.g., an unbounded signal or a hardcoded different value): if
      // the timeout were removed, this call never happens.
      expect(timeoutSpy).toHaveBeenCalledWith(CAPTURE_TIMEOUT_MS);
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(capturedSignal?.aborted).toBe(false);

      await capturePromise;

      // AbortSignal.timeout runs on the platform's own timer, which fake
      // timers do not intercept, so prove it actually fires by waiting past
      // the deadline with a real timer. If the timeout were removed (no
      // `signal` at all, or a signal that never aborts), this would hang
      // `aborted` at false forever instead of flipping to true here.
      await new Promise((resolve) =>
        setTimeout(resolve, CAPTURE_TIMEOUT_MS + 100),
      );
      expect(capturedSignal?.aborted).toBe(true);

      timeoutSpy.mockRestore();
    }, 10_000);
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
      expect(loggedContext).toEqual({
        category: 'invalid_destination',
        event: 'onboarding_completed',
      });
    });

    it('rejects the capture without sending it when POSTHOG_HOST is not a valid URL', async () => {
      mockConfig({ POSTHOG_HOST: 'not a url' });

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(safeFetch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toEqual({
        category: 'invalid_destination',
        event: 'onboarding_completed',
      });
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
      expect(loggedContext).toEqual({
        category: 'invalid_destination',
        event: 'onboarding_completed',
      });
    });

    it('rejects an explicit whitespace-only POSTHOG_HOST instead of falling back to the default', async () => {
      mockConfig({ POSTHOG_HOST: '   ' });

      await expect(
        service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
      ).resolves.toBeUndefined();

      expect(safeFetch).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [, loggedContext] = logger.warn.mock.calls[0];
      expect(loggedContext).toEqual({
        category: 'invalid_destination',
        event: 'onboarding_completed',
      });
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
      expect(loggedContext).toEqual({
        category: 'non_2xx_response',
        event: 'onboarding_completed',
        status: 429,
      });

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      // `.mock.calls[0][1]` is typed as Sentry's own
      // `ExclusiveEventHintOrCaptureContext` union, which does not expose
      // `extra` on every member — asserting through `toHaveBeenCalledWith`
      // (as the rest of the codebase's Sentry specs already do) avoids a
      // property access TypeScript can't narrow, while still checking the
      // exact object (no `objectContaining`, so no extra keys can hide).
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
        extra: {
          category: 'non_2xx_response',
          event: 'onboarding_completed',
          status: 429,
        },
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
      expect(loggedContext).toEqual({
        category: 'non_2xx_response',
        event: 'onboarding_completed',
        status: 503,
      });
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
      expect(loggedContext).toEqual({
        category: 'non_2xx_response',
        event: 'onboarding_completed',
        status: 302,
      });
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
      expect(loggedContext).toEqual({
        category: 'request_failed',
        event: 'onboarding_completed',
      });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure-report redaction (genfeedai/genfeed.ai#5314)', () => {
    it('never attaches the original exception, and never leaks its message, the distinct id, the project key, or event properties', async () => {
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
        distinctId: 'org_1_super_secret_distinct_id',
        event: 'onboarding_completed',
        properties: { secretPlan: SECRET_MARKER },
      });

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [logMessage, logContext] = logger.warn.mock.calls[0];
      expect(logMessage).not.toContain(SECRET_PROJECT_KEY);
      expect(logMessage).not.toContain(SECRET_MARKER);
      // Exhaustive: the failure context carries exactly the bounded
      // category and event name, nothing else — no distinct id, project
      // key, properties, or the original error at all.
      expect(logContext).toEqual({
        category: 'request_failed',
        event: 'onboarding_completed',
      });

      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      // Destructure only the exception argument: the options argument's
      // type (Sentry's ExclusiveEventHintOrCaptureContext union) does not
      // expose `extra` on every member, so its `.extra` is asserted below
      // through `toHaveBeenCalledWith` instead of a direct property access.
      const [sentryErrorArg] = vi.mocked(Sentry.captureException).mock.calls[0];
      // The exact object passed to Sentry must not be the original
      // exception, and its own message must not carry the leak either.
      expect(sentryErrorArg).not.toBe(leakyError);
      expect(sentryErrorArg).toBeInstanceOf(Error);
      expect((sentryErrorArg as Error).message).not.toContain(
        SECRET_PROJECT_KEY,
      );
      expect((sentryErrorArg as Error).message).not.toContain(SECRET_MARKER);
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
        extra: {
          category: 'request_failed',
          event: 'onboarding_completed',
        },
      });
    });

    it('never leaks the project key or distinct id when POSTHOG_HOST validation itself fails', async () => {
      mockConfig({ POSTHOG_HOST: 'http://insecure.example.com' });

      await service.capture({
        distinctId: 'org_1_super_secret_distinct_id',
        event: 'onboarding_completed',
      });

      const [logMessage, logContext] = logger.warn.mock.calls[0];
      expect(logMessage).not.toContain(SECRET_PROJECT_KEY);
      expect(logContext).toEqual({
        category: 'invalid_destination',
        event: 'onboarding_completed',
      });

      const [sentryErrorArg] = vi.mocked(Sentry.captureException).mock.calls[0];
      expect((sentryErrorArg as Error).message).not.toContain(
        SECRET_PROJECT_KEY,
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
        extra: {
          category: 'invalid_destination',
          event: 'onboarding_completed',
        },
      });
    });
  });
});
