import { ServerFunnelCaptureService } from '@api/services/analytics/server-funnel-capture.service';
import type { ConfigService } from '@libs/config/config.service';
import { safeFetch } from '@libs/security/destination-guard';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));
vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

describe('ServerFunnelCaptureService (genfeedai/genfeed.ai#4969)', () => {
  let configService: { get: ReturnType<typeof vi.fn> };
  let logger: { warn: ReturnType<typeof vi.fn> };
  let service: ServerFunnelCaptureService;

  beforeEach(() => {
    vi.clearAllMocks();
    configService = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'POSTHOG_PROJECT_API_KEY') return 'phc_test_key';
        return undefined;
      }),
    };
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
    expect(String(url)).toContain('/i/v0/e/');
    expect(String(url)).toMatch(/^https:\/\//);
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      api_key: 'phc_test_key',
      distinct_id: 'org_1',
      event: 'first_successful_publish',
      properties: { platform: 'x' },
    });
    // Defense-in-depth: the destination guard itself is told to reject
    // anything but HTTPS, including a plaintext redirect target.
    expect(options).toMatchObject({ allowedSchemes: ['https:'] });
  });

  it('no-ops without calling PostHog when no project key is configured', async () => {
    configService.get.mockReturnValue(undefined);

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

  it('rejects the capture without sending it when POSTHOG_HOST is HTTP', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'POSTHOG_PROJECT_API_KEY') return 'phc_test_key';
      if (key === 'POSTHOG_HOST') return 'http://insecure.example.com';
      return undefined;
    });

    await expect(
      service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
    ).resolves.toBeUndefined();

    expect(safeFetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [, loggedContext] = logger.warn.mock.calls[0];
    expect(loggedContext).not.toHaveProperty('projectKey');
    expect(loggedContext).not.toHaveProperty('properties');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [sentryError, sentryContext] = vi.mocked(Sentry.captureException).mock
      .calls[0];
    expect(String(sentryError)).not.toContain('phc_test_key');
    expect(sentryContext?.extra).not.toHaveProperty('projectKey');
    expect(sentryContext?.extra).not.toHaveProperty('properties');
  });

  it('rejects the capture without sending it when POSTHOG_HOST is not a valid URL', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'POSTHOG_PROJECT_API_KEY') return 'phc_test_key';
      if (key === 'POSTHOG_HOST') return 'not a url';
      return undefined;
    });

    await expect(
      service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
    ).resolves.toBeUndefined();

    expect(safeFetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

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
    expect(loggedContext).toMatchObject({ status: 429 });
    expect(loggedContext).not.toHaveProperty('projectKey');
    expect(loggedContext).not.toHaveProperty('properties');

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [, sentryContext] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(sentryContext?.extra).toMatchObject({ status: 429 });
    expect(sentryContext?.extra).not.toHaveProperty('projectKey');
    expect(sentryContext?.extra).not.toHaveProperty('properties');
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

  it('does not report a failure for a 2xx capture response', async () => {
    vi.mocked(safeFetch).mockResolvedValue({ ok: true, status: 202 } as never);

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
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('never logs the project key or event properties on any failure path', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('network down'));

    await service.capture({
      distinctId: 'org_1',
      event: 'onboarding_completed',
      properties: { secretPlan: 'super-secret-rollout' },
    });

    const allLoggedText = JSON.stringify(logger.warn.mock.calls);
    const allSentryText = JSON.stringify(
      vi.mocked(Sentry.captureException).mock.calls,
    );
    expect(allLoggedText).not.toContain('phc_test_key');
    expect(allLoggedText).not.toContain('super-secret-rollout');
    expect(allSentryText).not.toContain('phc_test_key');
    expect(allSentryText).not.toContain('super-secret-rollout');
  });
});
