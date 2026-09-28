import { PostHogFeatureFlagEvaluator } from '@api/feature-flag/posthog-feature-flag.evaluator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSaaS: vi.fn(),
  safeFetch: vi.fn(),
}));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/config/deployment')>();

  return { ...actual, isSaaS: mocks.isSaaS };
});

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: mocks.safeFetch,
}));

function createConfigService(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => overrides[key] ?? ''),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

describe('PostHogFeatureFlagEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSaaS.mockReturnValue(true);
  });

  it('is unconfigured in Community even when a project key is present', () => {
    mocks.isSaaS.mockReturnValue(false);
    const evaluator = new PostHogFeatureFlagEvaluator(
      createConfigService({
        POSTHOG_PROJECT_API_KEY: 'phc_testkey',
      }) as never,
      { warn: vi.fn() } as never,
    );

    expect(evaluator.isConfigured()).toBe(false);
  });

  it('is unconfigured in SaaS when PostHog is absent', () => {
    const evaluator = new PostHogFeatureFlagEvaluator(
      createConfigService() as never,
      { warn: vi.fn() } as never,
    );

    expect(evaluator.isConfigured()).toBe(false);
  });

  it('does not call PostHog when the deployment is Community', async () => {
    mocks.isSaaS.mockReturnValue(false);
    const evaluator = new PostHogFeatureFlagEvaluator(
      createConfigService({
        POSTHOG_PROJECT_API_KEY: 'phc_testkey',
      }) as never,
      { warn: vi.fn() } as never,
    );

    await expect(
      evaluator.isEnabled('reply_bot', { id: 'user-123' }),
    ).resolves.toBeUndefined();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it('evaluates the identified SaaS user with is_internal person properties', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        flags: {
          reply_bot: { enabled: false, key: 'reply_bot' },
        },
      }),
    );
    const evaluator = new PostHogFeatureFlagEvaluator(
      createConfigService({
        POSTHOG_HOST: 'https://eu.i.posthog.com',
        POSTHOG_PROJECT_API_KEY: 'phc_testkey',
      }) as never,
      { warn: vi.fn() } as never,
    );

    await expect(
      evaluator.isEnabled('reply_bot', {
        id: 'user-123',
        is_internal: true,
      }),
    ).resolves.toBe(false);

    expect(mocks.safeFetch).toHaveBeenCalledWith(
      'https://eu.i.posthog.com/flags?v=2',
      expect.objectContaining({
        method: 'POST',
      }),
      { allowedOrigins: ['https://eu.i.posthog.com'] },
    );
    const body = JSON.parse(
      String(mocks.safeFetch.mock.calls[0]?.[1]?.body),
    ) as {
      distinct_id: string;
      person_properties: { is_internal?: boolean };
      token: string;
    };
    expect(body).toEqual({
      distinct_id: 'user-123',
      person_properties: { is_internal: true },
      token: 'phc_testkey',
    });
  });

  it('reads the legacy featureFlags payload shape', async () => {
    mocks.safeFetch.mockResolvedValue(
      jsonResponse({
        featureFlags: { reply_bot: true },
      }),
    );
    const evaluator = new PostHogFeatureFlagEvaluator(
      createConfigService({
        POSTHOG_PROJECT_API_KEY: 'phc_testkey',
      }) as never,
      { warn: vi.fn() } as never,
    );

    await expect(
      evaluator.isEnabled('reply_bot', { id: 'user-123' }),
    ).resolves.toBe(true);
  });

  it('returns undefined when PostHog is unreachable so callers can fail open', async () => {
    mocks.safeFetch.mockRejectedValue(new Error('network down'));
    const evaluator = new PostHogFeatureFlagEvaluator(
      createConfigService({
        POSTHOG_PROJECT_API_KEY: 'phc_testkey',
      }) as never,
      { warn: vi.fn() } as never,
    );

    await expect(
      evaluator.isEnabled('reply_bot', { id: 'user-123' }),
    ).resolves.toBeUndefined();
  });

  describe('evaluatePlatformFlags (#5468)', () => {
    function evaluator() {
      return new PostHogFeatureFlagEvaluator(
        createConfigService({
          POSTHOG_PROJECT_API_KEY: 'phc_testkey',
        }) as never,
        { warn: vi.fn() } as never,
      );
    }

    it('evaluates every flag for the fixed platform identity', async () => {
      mocks.safeFetch.mockResolvedValue(
        jsonResponse({
          flags: {
            media_perception: {
              enabled: false,
              metadata: { payload: '{"frameCount":4}' },
            },
            moderation: {
              enabled: true,
              metadata: { payload: { provider: 'openai' } },
              variant: 'live',
            },
          },
        }),
      );

      await expect(evaluator().evaluatePlatformFlags()).resolves.toEqual({
        media_perception: {
          enabled: false,
          payload: '{"frameCount":4}',
          variant: null,
        },
        moderation: {
          enabled: true,
          payload: { provider: 'openai' },
          variant: 'live',
        },
      });
      const [, init] = mocks.safeFetch.mock.calls[0] ?? [];
      expect(JSON.parse(String(init?.body))).toMatchObject({
        distinct_id: 'genfeed-platform',
        person_properties: {},
      });
    });

    it('reads variants and payloads from the legacy response shape', async () => {
      mocks.safeFetch.mockResolvedValue(
        jsonResponse({
          featureFlagPayloads: { media_text_gate: '{"minConfidence":0.9}' },
          featureFlags: {
            agent_token_streaming: false,
            media_text_gate: 'shadow',
          },
        }),
      );

      await expect(evaluator().evaluatePlatformFlags()).resolves.toEqual({
        agent_token_streaming: {
          enabled: false,
          payload: undefined,
          variant: null,
        },
        media_text_gate: {
          enabled: true,
          payload: '{"minConfidence":0.9}',
          variant: 'shadow',
        },
      });
    });

    it.each([
      { errorsWhileComputingFlags: true, flags: {} },
      { flags: {}, quotaLimited: ['feature_flags'] },
      { flags: { moderation: { enabled: false, failed: true } } },
    ])('treats a failed evaluation as no answer: %o', async (body) => {
      mocks.safeFetch.mockResolvedValue(jsonResponse(body));

      await expect(
        evaluator().evaluatePlatformFlags(),
      ).resolves.toBeUndefined();
    });

    it('returns undefined without PostHog or when it fails', async () => {
      mocks.isSaaS.mockReturnValue(false);
      await expect(
        evaluator().evaluatePlatformFlags(),
      ).resolves.toBeUndefined();
      expect(mocks.safeFetch).not.toHaveBeenCalled();

      mocks.isSaaS.mockReturnValue(true);
      mocks.safeFetch.mockResolvedValue(jsonResponse({}, 503));
      await expect(
        evaluator().evaluatePlatformFlags(),
      ).resolves.toBeUndefined();
    });
  });
});
