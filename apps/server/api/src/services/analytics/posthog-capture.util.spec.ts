import { sendPostHogCapture } from '@api/services/analytics/posthog-capture.util';
import type { ConfigService } from '@libs/config/config.service';
import { safeFetch } from '@libs/security/destination-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: vi.fn(),
}));

function config(
  values: Record<string, string | undefined>,
): Pick<ConfigService, 'get'> {
  return {
    get: (key: string) => values[key],
  } as unknown as Pick<ConfigService, 'get'>;
}

const EVENT = {
  distinctId: 'user-1',
  event: 'onboarding_completed',
  properties: {},
};

describe('sendPostHogCapture', () => {
  beforeEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(safeFetch).mockResolvedValue({ ok: true, status: 200 } as never);
  });

  it.each([
    ['no project key', {}, EVENT, { status: 'skipped' }],
    [
      'an empty distinct id',
      { POSTHOG_PROJECT_API_KEY: 'phc_key' },
      { ...EVENT, distinctId: '' },
      { status: 'skipped' },
    ],
    [
      'an HTTP host',
      { POSTHOG_HOST: 'http://posthog.example', POSTHOG_PROJECT_API_KEY: 'k' },
      EVENT,
      { category: 'invalid_destination', status: 'failed' },
    ],
    [
      'a 2xx response',
      { POSTHOG_PROJECT_API_KEY: 'phc_key' },
      EVENT,
      { status: 'sent' },
    ],
  ])('returns the outcome for %s', async (_label, values, event, expected) => {
    await expect(sendPostHogCapture(config(values), event)).resolves.toEqual(
      expected,
    );
  });

  it.each([
    [
      'a non-2xx response',
      () =>
        vi
          .mocked(safeFetch)
          .mockResolvedValue({ ok: false, status: 503 } as never),
      { category: 'non_2xx_response', httpStatus: 503, status: 'failed' },
    ],
    [
      'a timeout',
      () =>
        vi
          .mocked(safeFetch)
          .mockRejectedValue(new DOMException('aborted', 'TimeoutError')),
      { category: 'timeout', status: 'failed' },
    ],
    [
      'a network error',
      () =>
        vi.mocked(safeFetch).mockRejectedValue(new TypeError('fetch failed')),
      { category: 'request_failed', status: 'failed' },
    ],
  ])('classifies %s without throwing', async (_label, arrange, expected) => {
    arrange();

    await expect(
      sendPostHogCapture(config({ POSTHOG_PROJECT_API_KEY: 'phc_key' }), EVENT),
    ).resolves.toEqual(expected);
  });
});
