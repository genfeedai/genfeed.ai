import { ServerFunnelCaptureService } from '@api/services/analytics/server-funnel-capture.service';
import type { ConfigService } from '@libs/config/config.service';
import { safeFetch } from '@libs/security/destination-guard';
import * as Sentry from '@sentry/nestjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: vi.fn().mockResolvedValue({ ok: true }),
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
    vi.mocked(safeFetch).mockResolvedValue({ ok: true } as never);

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
    const [url, init] = vi.mocked(safeFetch).mock.calls[0];
    expect(String(url)).toContain('/i/v0/e/');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      api_key: 'phc_test_key',
      distinct_id: 'org_1',
      event: 'first_successful_publish',
      properties: { platform: 'x' },
    });
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

  it('never throws when the PostHog request fails, and reports it to Sentry', async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error('network down'));

    await expect(
      service.capture({ distinctId: 'org_1', event: 'onboarding_completed' }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
