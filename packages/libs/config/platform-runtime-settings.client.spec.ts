import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeFetch } from '../security/destination-guard';
import { PlatformRuntimeSettingsClient } from './platform-runtime-settings.client';

vi.mock('../security/destination-guard', () => ({ safeFetch: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
const config = {
  get: (key: string) =>
    key === 'GENFEEDAI_API_URL'
      ? 'http://api.internal/v1'
      : 'deployment-secret',
};
const response = (emailFromAddress: string) =>
  new Response(
    JSON.stringify({
      data: {
        attributes: { ...DEFAULT_PLATFORM_FEATURE_SETTINGS, emailFromAddress },
      },
    }),
  );
describe('dynamic platform runtime settings client', () => {
  it('coalesces requests, authenticates, and adopts admin changes after 15 seconds', async () => {
    vi.useFakeTimers();
    vi.mocked(safeFetch)
      .mockResolvedValueOnce(response('one@example.com'))
      .mockResolvedValueOnce(response('two@example.com'));
    const client = new PlatformRuntimeSettingsClient(config);
    expect(
      (await Promise.all([client.get(), client.get()])).map(
        (value) => value.emailFromAddress,
      ),
    ).toEqual(['one@example.com', 'one@example.com']);
    expect(safeFetch).toHaveBeenCalledOnce();
    expect(safeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/v1/internal/platform-runtime-settings',
      }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer deployment-secret' },
      }),
      expect.objectContaining({ maxRedirects: 0 }),
    );
    vi.advanceTimersByTime(15001);
    expect((await client.get()).emailFromAddress).toBe('two@example.com');
    expect(safeFetch).toHaveBeenCalledTimes(2);
  });
  it('fails closed after expiry, sanitizes errors, and retries after recovery', async () => {
    vi.useFakeTimers();
    const client = new PlatformRuntimeSettingsClient(config);
    vi.mocked(safeFetch).mockResolvedValueOnce(response('one@example.com'));
    await client.get();
    vi.advanceTimersByTime(15001);
    vi.mocked(safeFetch).mockRejectedValueOnce(new Error('deployment-secret'));
    await expect(client.get()).rejects.toThrow(
      'Notification settings are unavailable',
    );
    vi.mocked(safeFetch).mockResolvedValueOnce(response('two@example.com'));
    expect((await client.get()).emailFromAddress).toBe('two@example.com');
  });
});
