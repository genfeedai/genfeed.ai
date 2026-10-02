import { DirectMediaProviderError } from '@api/services/integrations/direct-media/direct-media.types';
import {
  requestDirectMediaEmpty,
  requestDirectMediaJson,
} from '@api/services/integrations/direct-media/direct-media-transport';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('direct media transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults JSON and empty requests to a 30-second deadline', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal);
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      requestDirectMediaJson(transport, 'https://provider.example/jobs', {
        method: 'POST',
      }),
    ).resolves.toEqual({ ok: true });
    await requestDirectMediaEmpty(
      transport,
      'https://provider.example/jobs/id',
      {
        method: 'DELETE',
      },
    );
    expect(timeout.mock.calls).toEqual([[30_000], [30_000]]);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([1, 30_000, 180_000])(
    'forwards the explicit bounded deadline %i without waiting',
    async (timeoutMs) => {
      const timeoutSignal = new AbortController().signal;
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(timeoutSignal);
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ ok: true }));
      await requestDirectMediaJson(
        transport,
        'https://provider.example/jobs',
        { method: 'POST' },
        timeoutMs,
      );
      expect(timeout).toHaveBeenCalledExactlyOnceWith(timeoutMs);
      expect(transport).toHaveBeenCalledExactlyOnceWith(
        'https://provider.example/jobs',
        expect.objectContaining({ redirect: 'error', signal: timeoutSignal }),
      );
    },
  );

  it.each([
    0,
    -1,
    1.5,
    180_001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])(
    'rejects invalid deadline %s before timer creation or transport',
    async (timeoutMs) => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      const transport = vi.fn<typeof fetch>();
      const result = requestDirectMediaJson(
        transport,
        'https://provider.example/jobs',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer fixture-private-key' },
        },
        timeoutMs,
      );
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_TIMEOUT_INVALID',
        isSubmissionUncertain: false,
        message: 'Provider request timeout is invalid.',
      });
      await expect(result).rejects.toBeInstanceOf(DirectMediaProviderError);
      await expect(result).rejects.not.toThrow('fixture-private-key');
      expect(timeout).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it('keeps an overridden pre-aborted POST certain and undispatched', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal);
    const transport = vi.fn<typeof fetch>();
    await expect(
      requestDirectMediaJson(
        transport,
        'https://provider.example/jobs',
        { method: 'POST', signal: AbortSignal.abort() },
        180_000,
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_FAILED',
      isSubmissionUncertain: false,
    });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(180_000);
    expect(transport).not.toHaveBeenCalled();
  });

  it('keeps an elapsed overridden POST uncertain without retry or error disclosure', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal);
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new DOMException('fixture-private-key', 'TimeoutError'),
      );
    const result = requestDirectMediaJson(
      transport,
      'https://provider.example/jobs',
      { method: 'POST' },
      180_000,
    );
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_FAILED',
      isSubmissionUncertain: true,
    });
    await expect(result).rejects.not.toThrow('fixture-private-key');
    expect(timeout).toHaveBeenCalledExactlyOnceWith(180_000);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('keeps unreadable overridden POST responses uncertain', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(
      () => new AbortController().signal,
    );
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('fixture-private-key'));
    const result = requestDirectMediaJson(
      transport,
      'https://provider.example/jobs',
      { method: 'POST' },
      180_000,
    );
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      isSubmissionUncertain: true,
    });
    await expect(result).rejects.not.toThrow('fixture-private-key');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'releases an unsuccessful response body without replacing the provider error (cancel rejects: %s)',
    async (hasCancellationFailure) => {
      const response = new Response('fixture-private-key', { status: 402 });
      if (!response.body) throw new Error('Missing response body fixture');
      const cancel = vi.spyOn(response.body, 'cancel');
      if (hasCancellationFailure)
        cancel.mockRejectedValue(new Error('fixture-private-key'));
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      const result = requestDirectMediaJson(
        transport,
        'https://provider.example/jobs',
        { method: 'POST' },
      );
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_CREDIT_REQUIRED',
        status: 402,
        isSubmissionUncertain: false,
      });
      await expect(result).rejects.not.toThrow('fixture-private-key');
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'releases an empty-helper successful response body without replacing success (cancel rejects: %s)',
    async (hasCancellationFailure) => {
      const response = new Response('fixture-private-key', { status: 200 });
      if (!response.body) throw new Error('Missing response body fixture');
      const cancel = vi.spyOn(response.body, 'cancel');
      if (hasCancellationFailure)
        cancel.mockRejectedValue(new Error('fixture-private-key'));
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(
        requestDirectMediaEmpty(transport, 'https://provider.example/jobs/id', {
          method: 'DELETE',
        }),
      ).resolves.toBeUndefined();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

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
