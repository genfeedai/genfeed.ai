import {
  DirectMediaProviderError,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';
import { OpenAIImageClient } from '@api/services/integrations/direct-media/openai/openai-image.client';
import { compileOpenAIImageRequest } from '@api/services/integrations/direct-media/openai/openai-image.compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';
const KEY = 'fixture-private-key';
function request(
  mode: 'text-to-image' | 'image-edit' = 'text-to-image',
): PreparedDirectMediaRequest {
  return compileOpenAIImageRequest({
    model: 'gpt-image-2',
    mode,
    prompt: 'Draw a mountain',
    references:
      mode === 'image-edit' ? [{ url: 'https://assets.example/a.png' }] : [],
  });
}
function response(): Response {
  return Response.json({ created: 1, data: [{ b64_json: PNG }] });
}

describe('OpenAI image client', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['text-to-image', 'image-edit'] as const)(
    'dispatches exactly one fixed %s POST with ephemeral key and callback first',
    async (mode) => {
      const order: string[] = [];
      const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
        order.push('fetch');
        return response();
      });
      const callback = vi.fn(() => order.push('callback'));
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockImplementation(() => new AbortController().signal);
      const prepared = request(mode);
      const result = await new OpenAIImageClient(transport).submit(prepared, {
        apiKey: KEY,
        onProviderSubmissionStarted: callback,
      });
      expect(order).toEqual(['callback', 'fetch']);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(timeout).toHaveBeenCalledExactlyOnceWith(180_000);
      expect(transport).toHaveBeenCalledExactlyOnceWith(
        prepared.endpoint,
        expect.objectContaining({
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(prepared.body),
        }),
      );
      expect(result).toEqual({
        kind: 'inline',
        outputs: [{ base64: PNG, mimeType: 'image/png' }],
      });
      expect(JSON.stringify(prepared.body)).not.toContain(KEY);
      expect(JSON.stringify(result)).not.toContain(KEY);
    },
  );
  it('validates a key using only models GET and a 30 second bound', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => new AbortController().signal);
    expect(
      await new OpenAIImageClient(transport).validateCredential({
        apiKey: KEY,
      }),
    ).toEqual({ isValid: true });
    expect(transport).toHaveBeenCalledExactlyOnceWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${KEY}` },
      }),
    );
    expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
  });
  it.each([
    null,
    'private-response',
    [],
    {},
    { data: null },
    { data: {} },
    { data: 'private-response' },
  ])('rejects a malformed models-list HTTP 200 envelope', async (body) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body));
    const result = await new OpenAIImageClient(transport).validateCredential({
      apiKey: KEY,
    });
    expect(result).toEqual({
      isValid: false,
      error: 'PROVIDER_RESPONSE_INVALID',
    });
    expect(JSON.stringify(result)).not.toContain('private-response');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(['', '   ', '\t', `bad\r${KEY}`, `bad\n${KEY}`, null, undefined, 42])(
    'rejects an invalid ephemeral key before GET or paid callback',
    async (apiKey) => {
      const transport = vi.fn<typeof fetch>();
      const callback = vi.fn();
      const client = new OpenAIImageClient(transport);
      expect(
        await client.validateCredential({ apiKey: apiKey as string }),
      ).toEqual({ isValid: false, error: 'PROVIDER_CREDENTIAL_INVALID' });
      const result = client.submit(request(), {
        apiKey: apiKey as string,
        onProviderSubmissionStarted: callback,
      });
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_CREDENTIAL_INVALID',
        isSubmissionUncertain: false,
      });
      await expect(result).rejects.not.toThrow(KEY);
      expect(transport).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    },
  );
  it('redacts synchronous preparation callback failure without submission or retry', async () => {
    const transport = vi.fn<typeof fetch>();
    const callback = vi.fn(() => {
      throw new Error(`private database failure: ${KEY}`);
    });
    const result = new OpenAIImageClient(transport).submit(request(), {
      apiKey: KEY,
      onProviderSubmissionStarted: callback,
    });
    await expect(result).rejects.toBeInstanceOf(DirectMediaProviderError);
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_PREPARATION_FAILED',
      isSubmissionUncertain: false,
    });
    await expect(result).rejects.not.toThrow(KEY);
    await expect(result).rejects.not.toThrow('private database failure');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([401, 403])(
    'returns safe invalid credential on %i',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(KEY, { status }));
      const result = await new OpenAIImageClient(transport).validateCredential({
        apiKey: KEY,
      });
      expect(result).toEqual({
        isValid: false,
        error: 'PROVIDER_ACCESS_DENIED',
      });
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it('returns safe validation network failure without retry', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error(KEY));
    expect(
      await new OpenAIImageClient(transport).validateCredential({
        apiKey: KEY,
      }),
    ).toEqual({ isValid: false, error: 'PROVIDER_CONNECTION_FAILED' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('keeps preaborted submission undispatched without callback', async () => {
    const transport = vi.fn<typeof fetch>();
    const callback = vi.fn();
    await expect(
      new OpenAIImageClient(transport).submit(request(), {
        apiKey: KEY,
        signal: AbortSignal.abort(),
        onProviderSubmissionStarted: callback,
      }),
    ).rejects.toMatchObject({ isSubmissionUncertain: false });
    expect(transport).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
  it.each([
    { provider: 'google' },
    { model: 'openai/gpt-image-2' },
    { mode: 'image-edit' },
    { contractVersion: 'unreviewed' },
    { endpoint: 'https://attacker.example' },
    { endpoint: 'https://api.openai.com/v1/images/edits' },
    { secret: KEY },
  ])('rejects forged routing metadata before dispatch %j', async (change) => {
    const transport = vi.fn<typeof fetch>();
    const callback = vi.fn();
    await expect(
      new OpenAIImageClient(transport).submit(
        { ...request(), ...change } as PreparedDirectMediaRequest,
        { apiKey: KEY, onProviderSubmissionStarted: callback },
      ),
    ).rejects.toBeInstanceOf(DirectMediaProviderError);
    expect(transport).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
  it.each([
    { n: 2 },
    { quality: 'high' },
    { stream: true },
    { output_format: 'jpeg' },
    { background: 'transparent' },
    { moderation: 'low' },
    { response_format: undefined },
    { mask: 'https://assets.example/mask.png' },
    { apiKey: KEY },
    { input_fidelity: 'high' },
    { size: '1x1' },
    { images: [] },
    { prompt: '' },
    { model: 'gpt-image-2.5' },
  ])('rejects forged body controls before dispatch %j', async (change) => {
    const transport = vi.fn<typeof fetch>();
    const callback = vi.fn();
    const prepared = request();
    prepared.body = { ...prepared.body, ...change };
    await expect(
      new OpenAIImageClient(transport).submit(prepared, {
        apiKey: KEY,
        onProviderSubmissionStarted: callback,
      }),
    ).rejects.toBeInstanceOf(DirectMediaProviderError);
    expect(transport).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
  it('rejects deeply nested controls and excessive edit references before callback or transport', async () => {
    let deep: unknown = KEY;
    for (let index = 0; index < 10000; index++) deep = { nested: deep };
    const forged = [
      { ...request(), body: { ...request().body, unknownControl: deep } },
      { ...request(), body: { ...request().body, quality: deep } },
      {
        ...request('image-edit'),
        body: {
          ...request('image-edit').body,
          images: Array.from({ length: 17 }, () => ({
            image_url: 'https://assets.example/a.png',
          })),
        },
      },
    ];
    for (const prepared of forged) {
      const transport = vi.fn<typeof fetch>();
      const callback = vi.fn();
      const result = new OpenAIImageClient(transport).submit(prepared, {
        apiKey: KEY,
        onProviderSubmissionStarted: callback,
      });
      await expect(result).rejects.toBeInstanceOf(DirectMediaProviderError);
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_REQUEST_INVALID',
        isSubmissionUncertain: false,
      });
      await expect(result).rejects.not.toThrow(KEY);
      expect(transport).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    }
  });
  it('rejects body accessors without invoking them', async () => {
    const prepared = request();
    const getter = vi.fn(() => KEY);
    Object.defineProperty(prepared.body, 'prompt', {
      enumerable: true,
      get: getter,
    });
    const transport = vi.fn<typeof fetch>();
    await expect(
      new OpenAIImageClient(transport).submit(prepared, { apiKey: KEY }),
    ).rejects.toBeInstanceOf(DirectMediaProviderError);
    expect(getter).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { data: [] },
    { data: [{ url: 'https://attacker.example/image.png' }] },
    { data: [{ b64_json: '' }] },
    { data: [{ b64_json: 'bad' }] },
    { data: [{ b64_json: `${PNG}\n` }] },
    { data: [{ b64_json: '/9j/AA==' }] },
    { data: [{ b64_json: 'iVBORw0KGgo=' }] },
    { data: [{ b64_json: PNG }, { b64_json: PNG }] },
    { data: [{ b64_json: PNG, mime_type: 'image/jpeg' }] },
  ])('rejects invalid accepted response with uncertainty', async (body) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body));
    await expect(
      new OpenAIImageClient(transport).submit(request(), { apiKey: KEY }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      isSubmissionUncertain: true,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed JSON safely as uncertain', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(KEY));
    const result = new OpenAIImageClient(transport).submit(request(), {
      apiKey: KEY,
    });
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      isSubmissionUncertain: true,
    });
    await expect(result).rejects.not.toThrow(KEY);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    [400, 'PROVIDER_REQUEST_REJECTED', false],
    [401, 'PROVIDER_ACCESS_DENIED', false],
    [403, 'PROVIDER_ACCESS_DENIED', false],
    [402, 'PROVIDER_CREDIT_REQUIRED', false],
    [429, 'PROVIDER_RATE_LIMITED', false],
    [500, 'PROVIDER_UNAVAILABLE', true],
  ] as const)(
    'preserves shared HTTP %i mapping without retry',
    async (status, code, isSubmissionUncertain) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(KEY, { status }));
      const result = new OpenAIImageClient(transport).submit(request(), {
        apiKey: KEY,
      });
      await expect(result).rejects.toMatchObject({
        code,
        status,
        isSubmissionUncertain,
      });
      await expect(result).rejects.not.toThrow(KEY);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves timeout or redirect transport uncertainty without retry', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException(KEY, 'TimeoutError'));
    const result = new OpenAIImageClient(transport).submit(request(), {
      apiKey: KEY,
    });
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_FAILED',
      isSubmissionUncertain: true,
    });
    await expect(result).rejects.not.toThrow(KEY);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('makes no HTTP requests for unsupported poll or cancellation', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = new OpenAIImageClient(transport);
    await expect(
      client.poll(
        {
          externalId: 'not-a-real-job',
          pollingUrl: 'https://attacker.example',
        },
        { apiKey: KEY },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TASK_UNSUPPORTED' });
    expect(
      await client.cancel({ externalId: 'not-a-real-job' }, { apiKey: KEY }),
    ).toEqual({ status: 'unsupported' });
    expect(transport).not.toHaveBeenCalled();
  });
});
