import { DirectMediaProviderError } from '@api/services/integrations/direct-media/direct-media.types';
import {
  requestDirectMediaEmpty,
  requestDirectMediaJson,
} from '@api/services/integrations/direct-media/direct-media-transport';
import { describe, expect, it, vi } from 'vitest';

describe('direct media transport', () => {
  it('supports documented no-content cancellation responses', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      requestDirectMediaEmpty(transport, 'https://provider.example/jobs/id', {
        method: 'DELETE',
      }),
    ).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not retry an uncertain submission or retain secret-bearing errors', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('fixture-private-key'));
    const result = requestDirectMediaJson(
      transport,
      'https://provider.example/jobs',
      { method: 'POST' },
    );
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_FAILED',
      isSubmissionUncertain: true,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(result).rejects.not.toThrow('fixture-private-key');
  });

  it('disables redirects and classifies provider credits separately', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('private provider body', { status: 402 }),
      );
    await expect(
      requestDirectMediaJson(transport, 'https://provider.example/jobs', {
        method: 'POST',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_CREDIT_REQUIRED',
      status: 402,
      isSubmissionUncertain: false,
    });
    expect(transport).toHaveBeenCalledWith(
      'https://provider.example/jobs',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('fails before network access when already cancelled', async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      requestDirectMediaJson(transport, 'https://provider.example/jobs', {
        method: 'GET',
        signal: AbortSignal.abort(),
      }),
    ).rejects.toBeInstanceOf(DirectMediaProviderError);
    expect(transport).not.toHaveBeenCalled();
  });
});
