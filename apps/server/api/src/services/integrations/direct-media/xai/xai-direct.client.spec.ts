import {
  DirectMediaProviderError,
  type DirectMediaTransport,
} from '@api/services/integrations/direct-media/direct-media.types';
import { XaiDirectClient } from '@api/services/integrations/direct-media/xai/xai-direct.client';
import { compileXaiDirectRequest } from '@api/services/integrations/direct-media/xai/xai-direct.contract';
import { describe, expect, it, vi } from 'vitest';

const context = { apiKey: 'test-credential-do-not-log' };
const image = compileXaiDirectRequest({
  model: 'grok-imagine-image-2.0',
  mode: 'text-to-image',
  prompt: 'A lighthouse',
  references: [],
});
const video = compileXaiDirectRequest({
  model: 'grok-imagine-video-1.5',
  mode: 'text-to-video',
  prompt: 'A lighthouse',
  references: [],
});
function fixture(body: unknown, status = 200) {
  const transport = vi.fn<DirectMediaTransport>(async () =>
    Response.json(body, { status }),
  );
  return { client: new XaiDirectClient(transport), transport };
}

describe('XaiDirectClient', () => {
  const privacyContext = { apiKey: 'fixture-private-key' };
  const encodedKey =
    '%66%69%78%74%75%72%65%2d%70%72%69%76%61%74%65%2d%6b%65%79';
  const reflections = [
    privacyContext.apiKey,
    encodedKey,
    encodedKey.toUpperCase(),
    '%66%69%78%74%75%72%65%2D%70%72%69%76%61%74%65%2d%6B%65%79',
    '%66ixture-private-key',
    encodedKey.replaceAll('%', '%25'),
    encodedKey.replaceAll('%', '%25').replaceAll('%', '%25'),
    `%ZZ${encodedKey}`,
  ];

  it.each(reflections)(
    'rejects raw or encoded image/video URL reflections in query and path: %s',
    async (reflected) => {
      for (const url of [
        `https://outputs.example/${reflected}/result`,
        `https://outputs.example/result?signature=${reflected}`,
      ]) {
        const item = fixture({ data: [{ url }] });
        const started = vi.fn();
        const submission = item.client.submit(image, {
          ...privacyContext,
          onProviderSubmissionStarted: started,
        });
        await expect(submission).rejects.toMatchObject({
          code: 'PROVIDER_RESPONSE_INVALID',
          isSubmissionUncertain: true,
        });
        await expect(submission).rejects.not.toThrow(privacyContext.apiKey);
        await expect(submission).rejects.not.toThrow(reflected);
        await submission.catch((error: unknown) => {
          expect(JSON.stringify(error)).not.toContain(privacyContext.apiKey);
          expect(JSON.stringify(error)).not.toContain(reflected);
        });
        expect(started).toHaveBeenCalledTimes(1);
        expect(item.transport).toHaveBeenCalledTimes(1);
        expect(item.transport.mock.calls[0][1]?.method).toBe('POST');
        const polling = fixture({
          status: 'done',
          video: { url, respect_moderation: true },
        });
        const result = polling.client.poll(
          { externalId: 'job-123', model: video.model },
          privacyContext,
        );
        await expect(result).rejects.toMatchObject({
          code: 'PROVIDER_RESPONSE_INVALID',
          isSubmissionUncertain: false,
        });
        await expect(result).rejects.not.toThrow(privacyContext.apiKey);
        await expect(result).rejects.not.toThrow(reflected);
        await result.catch((error: unknown) => {
          expect(JSON.stringify(error)).not.toContain(privacyContext.apiKey);
          expect(JSON.stringify(error)).not.toContain(reflected);
        });
        expect(polling.transport).toHaveBeenCalledTimes(1);
        expect(polling.transport.mock.calls[0][1]?.method).toBe('GET');
      }
    },
  );

  it.each(reflections)(
    'rejects returned credential-bearing or syntactically invalid video IDs as uncertain: %s',
    async (reflected) => {
      const item = fixture({ request_id: `job-${reflected}` });
      const started = vi.fn();
      const result = item.client.submit(video, {
        ...privacyContext,
        onProviderSubmissionStarted: started,
      });
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_RESPONSE_INVALID',
        isSubmissionUncertain: true,
      });
      await expect(result).rejects.not.toThrow(privacyContext.apiKey);
      await expect(result).rejects.not.toThrow(reflected);
      await result.catch((error: unknown) => {
        expect(JSON.stringify(error)).not.toContain(privacyContext.apiKey);
        expect(JSON.stringify(error)).not.toContain(reflected);
      });
      expect(started).toHaveBeenCalledTimes(1);
      expect(item.transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each(reflections)(
    'rejects recovered raw or syntactically forbidden encoded IDs before poll/cancel: %s',
    async (reflected) => {
      const item = fixture({ status: 'pending' });
      const task = { externalId: `job-${reflected}`, model: video.model };
      for (const operation of [
        () => item.client.poll(task, privacyContext),
        () => item.client.cancel(task, privacyContext),
      ]) {
        const result = operation();
        await expect(result).rejects.toMatchObject({
          code: 'PROVIDER_INPUT_INVALID',
          isSubmissionUncertain: false,
        });
        await expect(result).rejects.not.toThrow(privacyContext.apiKey);
        await expect(result).rejects.not.toThrow(reflected);
        await result.catch((error: unknown) => {
          expect(JSON.stringify(error)).not.toContain(privacyContext.apiKey);
          expect(JSON.stringify(error)).not.toContain(reflected);
        });
      }
      expect(item.transport).not.toHaveBeenCalled();
    },
  );

  it('keeps the forbidden recovered URL gate and valid unsupported cancellation', async () => {
    const item = fixture({});
    await expect(
      item.client.poll(
        {
          externalId: 'job-123',
          pollingUrl: `https://api.x.ai/v1/videos/job-123?key=${encodedKey}`,
        },
        privacyContext,
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_INPUT_INVALID',
      isSubmissionUncertain: false,
    });
    await expect(
      item.client.cancel(
        { externalId: 'job-123', model: video.model },
        privacyContext,
      ),
    ).resolves.toEqual({ status: 'unsupported' });
    expect(item.transport).not.toHaveBeenCalled();
  });

  it('preserves safe inline base64 when a reflected URL is discarded, without decoding media bytes', async () => {
    const base64 = Buffer.from(privacyContext.apiKey).toString('base64');
    const item = fixture({
      data: [
        {
          url: `https://outputs.example/image?signature=${encodedKey}`,
          b64_json: base64,
        },
      ],
    });
    await expect(item.client.submit(image, privacyContext)).resolves.toEqual({
      kind: 'inline',
      outputs: [{ base64, mimeType: 'image/jpeg' }],
    });
    expect(item.transport).toHaveBeenCalledTimes(1);
  });

  it('keeps encoded strings outside the accepted base64 alphabet', async () => {
    const item = fixture({ data: [{ b64_json: encodedKey }] });
    const result = item.client.submit(image, privacyContext);
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      isSubmissionUncertain: true,
    });
    await expect(result).rejects.not.toThrow(encodedKey);
    expect(item.transport).toHaveBeenCalledTimes(1);
  });

  it('preserves unrelated signed URL escapes/malformed escapes and valid video task hints', async () => {
    const url =
      'https://outputs.example/output%20image?signature=safe%2fvalue&hint=%ZZ';
    await expect(
      fixture({ data: [{ url }] }).client.submit(image, privacyContext),
    ).resolves.toEqual({
      kind: 'inline',
      outputs: [{ url, mimeType: 'image/jpeg' }],
    });
    await expect(
      fixture({ request_id: 'job-123' }).client.submit(video, privacyContext),
    ).resolves.toEqual({
      kind: 'task',
      externalId: 'job-123',
      model: video.model,
    });
    await expect(
      fixture({
        status: 'done',
        video: { url, respect_moderation: true },
      }).client.poll(
        { externalId: 'job-123', model: video.model },
        privacyContext,
      ),
    ).resolves.toEqual({
      status: 'succeeded',
      outputs: [{ url, mimeType: 'video/mp4' }],
    });
  });

  it('submits compiled JSON with bearer authorization and the submission callback', async () => {
    const { client, transport } = fixture({
      data: [{ url: 'https://outputs.example/a.jpg' }],
    });
    const started = vi.fn(() => undefined);
    transport.mockImplementation(async (_url, init) => {
      expect(started).toHaveBeenCalledTimes(1);
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toEqual({
        Authorization: `Bearer ${context.apiKey}`,
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(String(init?.body))).toEqual(image.body);
      return Response.json({
        data: [{ url: 'https://outputs.example/a.jpg' }],
      });
    });
    expect(
      await client.submit(image, {
        ...context,
        onProviderSubmissionStarted: started,
      }),
    ).toEqual({
      kind: 'inline',
      outputs: [
        { url: 'https://outputs.example/a.jpg', mimeType: 'image/jpeg' },
      ],
    });
    expect(transport.mock.calls[0][0]).toBe(image.endpoint);
  });
  it('accepts inline base64 images and asynchronous request IDs', async () => {
    expect(
      await fixture({ data: [{ b64_json: 'aW1hZ2U=' }] }).client.submit(
        image,
        context,
      ),
    ).toEqual({
      kind: 'inline',
      outputs: [{ base64: 'aW1hZ2U=', mimeType: 'image/jpeg' }],
    });
    expect(
      await fixture({ request_id: 'job-123' }).client.submit(video, context),
    ).toEqual({ kind: 'task', externalId: 'job-123', model: video.model });
  });
  it('validates prepared request before invoking callback or paid network', async () => {
    const { client, transport } = fixture({});
    const started = vi.fn(() => undefined);
    for (const request of [
      { ...image, endpoint: 'https://evil.example' },
      { ...image, provider: 'google' as const },
      { ...image, body: { ...image.body, seed: 1 } },
      { ...image, body: { ...image.body, model: 'unknown' } },
      { ...image, contractVersion: 'old' },
    ])
      await expect(
        client.submit(request, {
          ...context,
          onProviderSubmissionStarted: started,
        }),
      ).rejects.toThrow();
    await expect(
      client.submit(image, {
        apiKey: '',
        onProviderSubmissionStarted: started,
      }),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.submit(image, {
        ...context,
        signal: controller.signal,
        onProviderSubmissionStarted: started,
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(started).not.toHaveBeenCalled();
  });
  it('marks malformed successful submission responses uncertain', async () => {
    for (const body of [
      {},
      { data: [] },
      { data: [{ url: 'http://outputs.example/a.jpg' }] },
      { data: [{ b64_json: '' }] },
    ]) {
      try {
        await fixture(body).client.submit(image, context);
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(DirectMediaProviderError);
        expect((error as DirectMediaProviderError).isSubmissionUncertain).toBe(
          true,
        );
      }
    }
    await expect(
      fixture({ request_id: '../bad' }).client.submit(video, context),
    ).rejects.toMatchObject({ isSubmissionUncertain: true });
  });
  it('maps pending, done, failed and expired without provider error disclosure', async () => {
    const task = { externalId: 'job-123', model: video.model };
    expect(
      await fixture({ status: 'pending' }).client.poll(task, context),
    ).toEqual({ status: 'running' });
    expect(
      await fixture({
        status: 'done',
        video: {
          url: 'https://outputs.example/a.mp4',
          respect_moderation: true,
        },
      }).client.poll(task, context),
    ).toEqual({
      status: 'succeeded',
      outputs: [
        { url: 'https://outputs.example/a.mp4', mimeType: 'video/mp4' },
      ],
    });
    for (const status of ['failed', 'expired'])
      expect(
        await fixture({
          status,
          error: { message: context.apiKey },
        }).client.poll(task, context),
      ).toMatchObject({
        status: 'failed',
        error: { message: 'Provider video generation failed.' },
      });
    await expect(
      fixture({ status: 'surprise' }).client.poll(task, context),
    ).rejects.toThrow();
    await expect(
      fixture({
        status: 'done',
        video: {
          url: 'https://outputs.example/a.mp4',
          respect_moderation: false,
        },
      }).client.poll(task, context),
    ).rejects.toThrow();
  });
  it('builds polling endpoint from a safe ID and rejects arbitrary polling URLs', async () => {
    const { client, transport } = fixture({ status: 'pending' });
    await client.poll({ externalId: 'job-123' }, context);
    expect(transport.mock.calls[0][0]).toBe(
      'https://api.x.ai/v1/videos/job-123',
    );
    for (const task of [
      { externalId: '../x' },
      { externalId: 'https://evil.example' },
      { externalId: 'job-123', pollingUrl: 'https://evil.example' },
      { externalId: 'job-123', model: image.model },
    ])
      await expect(client.poll(task, context)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('requires unblocked enabled key and image/video permission ACLs', async () => {
    const valid = {
      api_key_blocked: false,
      api_key_disabled: false,
      team_blocked: false,
      acls: ['api-key:model:*', 'api-key:endpoint:*'],
    };
    expect(await fixture(valid).client.validateCredential(context)).toEqual({
      isValid: true,
    });
    for (const body of [
      {},
      { ...valid, api_key_blocked: true },
      { ...valid, api_key_disabled: true },
      { ...valid, team_blocked: true },
      { ...valid, acls: [] },
      { ...valid, acls: ['api-key:model:grok-4', 'api-key:endpoint:*'] },
    ])
      expect(
        (await fixture(body).client.validateCredential(context)).isValid,
      ).toBe(false);
    expect(
      await fixture({ error: context.apiKey }, 401).client.validateCredential(
        context,
      ),
    ).toEqual({
      isValid: false,
      error: 'Provider credential could not be validated.',
    });
    const { client, transport } = fixture(valid);
    expect((await client.validateCredential({ apiKey: '' })).isValid).toBe(
      false,
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it('does not retry transport/HTTP/JSON failures or expose credentials', async () => {
    const transport = vi.fn<DirectMediaTransport>(async () => {
      throw new Error(context.apiKey);
    });
    const client = new XaiDirectClient(transport);
    await expect(client.submit(image, context)).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_FAILED',
      isSubmissionUncertain: true,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    for (const status of [401, 402, 429, 500]) {
      const item = fixture({ error: context.apiKey }, status);
      try {
        await item.client.submit(image, context);
        throw new Error('expected rejection');
      } catch (error) {
        expect(String(error)).not.toContain(context.apiKey);
        expect((error as DirectMediaProviderError).isSubmissionUncertain).toBe(
          status >= 500,
        );
      }
      expect(item.transport).toHaveBeenCalledTimes(1);
    }
    const invalidJson = new XaiDirectClient(
      vi.fn<DirectMediaTransport>(async () => new Response('invalid json')),
    );
    await expect(invalidJson.submit(image, context)).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      isSubmissionUncertain: true,
    });
  });
  it('reports unsupported remote cancellation without a network call', async () => {
    const { client, transport } = fixture({});
    expect(await client.cancel({ externalId: 'job-123' }, context)).toEqual({
      status: 'unsupported',
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
