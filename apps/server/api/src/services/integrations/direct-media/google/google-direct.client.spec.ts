import { GoogleDirectClient } from '@api/services/integrations/direct-media/google/google-direct.client';
import { compileGoogleDirectRequest } from '@api/services/integrations/direct-media/google/google-direct.contract';
import { describe, expect, it, vi } from 'vitest';

const key = 'fixture-private-key';
const context = { apiKey: key };
const input = {
  model: 'gemini-3.1-flash-image',
  mode: 'text-to-image' as const,
  prompt: 'A tree',
  references: [],
};
const operation = 'models/veo-3.1-generate-preview/operations/abc123';
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
describe('Google direct client', () => {
  const encodedKey =
    '%66%69%78%74%75%72%65%2d%70%72%69%76%61%74%65%2d%6b%65%79';
  const reflections = [
    key,
    encodedKey,
    encodedKey.toUpperCase(),
    '%66%69%78%74%75%72%65%2D%70%72%69%76%61%74%65%2d%6B%65%79',
    '%66ixture-private-key',
    encodedKey.replaceAll('%', '%25'),
    encodedKey.replaceAll('%', '%25').replaceAll('%', '%25'),
    `%ZZ${encodedKey}`,
  ];
  const protectedUri = (reflected: string, position: 'path' | 'query') =>
    position === 'path'
      ? `https://generativelanguage.googleapis.com/v1beta/files/${reflected}:download?alt=media`
      : `https://generativelanguage.googleapis.com/v1beta/files/a:download?alt=media&hint=${reflected}`;

  it.each(reflections)(
    'rejects returned raw or encoded operation identities without retry: %s',
    async (reflected) => {
      const name = `models/veo-3.1-generate-preview/operations/${reflected}`;
      const started = vi.fn();
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
          expect(started).toHaveBeenCalledTimes(1);
          expect(init?.method).toBe('POST');
          return json({ name });
        });
      const result = new GoogleDirectClient(transport).submit(
        compileGoogleDirectRequest({
          ...input,
          model: 'veo-3.1-generate-preview',
          mode: 'text-to-video',
        }),
        { ...context, onProviderSubmissionStarted: started },
      );
      await expect(result).rejects.toMatchObject({
        code: 'GOOGLE_RESPONSE_INVALID',
        isSubmissionUncertain: true,
      });
      await expect(result).rejects.not.toThrow(key);
      await expect(result).rejects.not.toThrow(reflected);
      await result.catch((error: unknown) => {
        expect(JSON.stringify(error)).not.toContain(key);
        expect(JSON.stringify(error)).not.toContain(reflected);
      });
      expect(started).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each(reflections)(
    'rejects recovered raw credential identities and structurally forbidden encoded identities before GET: %s',
    async (reflected) => {
      const externalId = `models/veo-3.1-generate-preview/operations/${reflected}`;
      const transport = vi.fn<typeof fetch>();
      const result = new GoogleDirectClient(transport).poll(
        {
          externalId,
          pollingUrl: `https://generativelanguage.googleapis.com/v1beta/${externalId}`,
          model: 'veo-3.1-generate-preview',
        },
        context,
      );
      await expect(result).rejects.toMatchObject({
        code: 'GOOGLE_RECOVERY_UNSUPPORTED',
        isSubmissionUncertain: false,
      });
      await expect(result).rejects.not.toThrow(key);
      await expect(result).rejects.not.toThrow(reflected);
      await result.catch((error: unknown) => {
        expect(JSON.stringify(error)).not.toContain(key);
        expect(JSON.stringify(error)).not.toContain(reflected);
      });
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it('rejects mismatched and credential-bearing canonical recovery URLs before GET', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = new GoogleDirectClient(transport);
    await expect(
      client.poll(
        {
          externalId: operation,
          pollingUrl: `https://generativelanguage.googleapis.com/v1beta/${operation}?key=${key}`,
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: 'GOOGLE_TASK_INVALID',
      isSubmissionUncertain: false,
    });
    // Synthetic host-string key isolates polling-URL reflection from operation grammar.
    const synthetic = { apiKey: 'generativelanguage.googleapis.com' };
    const result = client.poll(
      {
        externalId: operation,
        pollingUrl: `https://generativelanguage.googleapis.com/v1beta/${operation}`,
      },
      synthetic,
    );
    await expect(result).rejects.toMatchObject({
      code: 'GOOGLE_TASK_INVALID',
      isSubmissionUncertain: false,
    });
    await expect(result).rejects.not.toThrow(synthetic.apiKey);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(reflections)(
    'rejects protected Interactions/Veo URI reflections in path and query safely: %s',
    async (reflected) => {
      for (const position of ['path', 'query'] as const) {
        const uri = protectedUri(reflected, position);
        const started = vi.fn();
        const transport = vi
          .fn<typeof fetch>()
          .mockImplementation(async (_url, init) => {
            if (init?.method === 'POST') {
              expect(started).toHaveBeenCalledTimes(1);
              return json({
                steps: [
                  {
                    type: 'model_output',
                    content: [{ type: 'image', uri, mime_type: 'image/png' }],
                  },
                ],
              });
            }
            return json({
              done: true,
              response: {
                generateVideoResponse: {
                  generatedSamples: [{ video: { uri } }],
                },
              },
            });
          });
        const client = new GoogleDirectClient(transport);
        const submission = client.submit(compileGoogleDirectRequest(input), {
          ...context,
          onProviderSubmissionStarted: started,
        });
        await expect(submission).rejects.toMatchObject({
          code: 'GOOGLE_RESPONSE_INVALID',
          isSubmissionUncertain: true,
        });
        await expect(submission).rejects.not.toThrow(key);
        await expect(submission).rejects.not.toThrow(reflected);
        await submission.catch((error: unknown) => {
          expect(JSON.stringify(error)).not.toContain(key);
          expect(JSON.stringify(error)).not.toContain(reflected);
        });
        const poll = client.poll({ externalId: operation }, context);
        await expect(poll).rejects.toMatchObject({
          code: 'GOOGLE_RESPONSE_INVALID',
          isSubmissionUncertain: false,
        });
        await expect(poll).rejects.not.toThrow(key);
        await expect(poll).rejects.not.toThrow(reflected);
        await poll.catch((error: unknown) => {
          expect(JSON.stringify(error)).not.toContain(key);
          expect(JSON.stringify(error)).not.toContain(reflected);
        });
        expect(started).toHaveBeenCalledTimes(1);
        expect(transport.mock.calls.map((call) => call[1]?.method)).toEqual([
          'POST',
          'GET',
        ]);
      }
    },
  );

  it('rejects synthetic normalized protected-URI reflection before alt query validation', async () => {
    const synthetic = { apiKey: 'media' };
    const uri =
      'https://generativelanguage.googleapis.com/v1beta/files/a:download?alt=%6dedia';
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) =>
        init?.method === 'POST'
          ? json({
              steps: [
                {
                  type: 'model_output',
                  content: [{ type: 'image', uri, mime_type: 'image/png' }],
                },
              ],
            })
          : json({
              done: true,
              response: {
                generateVideoResponse: {
                  generatedSamples: [{ video: { uri } }],
                },
              },
            }),
      );
    const client = new GoogleDirectClient(transport);
    const submission = client.submit(
      compileGoogleDirectRequest(input),
      synthetic,
    );
    await expect(submission).rejects.toMatchObject({
      code: 'GOOGLE_RESPONSE_INVALID',
      isSubmissionUncertain: true,
    });
    const poll = client.poll({ externalId: operation }, synthetic);
    await expect(poll).rejects.toMatchObject({
      code: 'GOOGLE_RESPONSE_INVALID',
      isSubmissionUncertain: false,
    });
    for (const result of [submission, poll]) {
      await expect(result).rejects.toMatchObject({
        message: 'Google returned an unsupported media response.',
      });
      await expect(result).rejects.not.toThrow('%6dedia');
      await result.catch((error: unknown) => {
        expect(JSON.stringify(error)).not.toContain('media');
        expect(JSON.stringify(error)).not.toContain('%6dedia');
      });
    }
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('preserves protected URI spelling, requiresCredential and safe operation hints', async () => {
    const uri =
      'https://generativelanguage.googleapis.com/v1beta/files/a:download?alt=%6dedia';
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) =>
        init?.method === 'POST'
          ? json({
              steps: [
                {
                  type: 'model_output',
                  content: [{ type: 'image', uri, mime_type: 'image/png' }],
                },
              ],
            })
          : json({
              name: operation,
              done: true,
              response: {
                generateVideoResponse: {
                  generatedSamples: [{ video: { uri } }],
                },
              },
            }),
      );
    const client = new GoogleDirectClient(transport);
    await expect(
      client.submit(compileGoogleDirectRequest(input), context),
    ).resolves.toEqual({
      kind: 'inline',
      outputs: [{ url: uri, mimeType: 'image/png', requiresCredential: true }],
    });
    await expect(
      client.poll(
        {
          externalId: operation,
          pollingUrl: `https://generativelanguage.googleapis.com/v1beta/${operation}`,
          model: 'veo-3.1-generate-preview',
        },
        context,
      ),
    ).resolves.toEqual({
      status: 'succeeded',
      outputs: [{ url: uri, mimeType: 'video/mp4', requiresCredential: true }],
    });
    await expect(
      client.cancel({ externalId: key, pollingUrl: key }, { apiKey: '' }),
    ).resolves.toEqual({ status: 'unsupported' });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('submits Interactions and reads REST model_output steps only', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        steps: [
          { type: 'user_input', content: [{ type: 'image', data: 'ignore' }] },
          {
            type: 'model_output',
            content: [
              { type: 'text', text: 'ignore' },
              { type: 'image', data: 'YQ==', mime_type: 'image/png' },
            ],
          },
        ],
      }),
    );
    const started = vi.fn();
    const result = await new GoogleDirectClient(transport).submit(
      compileGoogleDirectRequest(input),
      { ...context, onProviderSubmissionStarted: started },
    );
    expect(result).toEqual({
      kind: 'inline',
      outputs: [{ base64: 'YQ==', mimeType: 'image/png' }],
    });
    expect(started).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        redirect: 'error',
      }),
    );
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it('snapshots validated request before the submission callback can mutate it', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'image', data: 'YQ==', mime_type: 'image/png' }],
          },
        ],
      }),
    );
    const request = compileGoogleDirectRequest(input);
    const originalBody = JSON.stringify(request.body);
    await new GoogleDirectClient(transport).submit(request, {
      ...context,
      onProviderSubmissionStarted: () => {
        request.endpoint = 'https://evil.example';
        request.model = 'unknown';
        request.body.background = true;
      },
    });
    expect(transport).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({ body: originalBody }),
    );
  });
  it('submits Veo once and polls the exact operation with original credential', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ name: operation }))
      .mockResolvedValueOnce(json({ done: false }))
      .mockResolvedValueOnce(
        json({
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [
                {
                  video: {
                    uri: 'https://generativelanguage.googleapis.com/v1beta/files/video123:download?alt=media',
                  },
                },
              ],
            },
          },
        }),
      );
    const client = new GoogleDirectClient(transport);
    const task = await client.submit(
      compileGoogleDirectRequest({
        ...input,
        model: 'veo-3.1-generate-preview',
        mode: 'text-to-video',
      }),
      context,
    );
    expect(task.kind).toBe('task');
    if (task.kind !== 'task') throw new Error('expected task');
    expect(await client.poll(task, context)).toEqual({ status: 'running' });
    expect(await client.poll(task, context)).toEqual({
      status: 'succeeded',
      outputs: [
        {
          url: 'https://generativelanguage.googleapis.com/v1beta/files/video123:download?alt=media',
          mimeType: 'video/mp4',
          requiresCredential: true,
        },
      ],
    });
    expect(await client.cancel(task, context)).toEqual({
      status: 'unsupported',
    });
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('redacts operation errors and rejects malformed media after submission as uncertain', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ done: true, error: { message: key } }))
      .mockResolvedValueOnce(
        json({ id: 'interaction-123', status: 'in_progress' }),
      );
    const client = new GoogleDirectClient(transport);
    expect(await client.poll({ externalId: operation }, context)).toEqual({
      status: 'failed',
      error: {
        code: 'GOOGLE_OPERATION_FAILED',
        message: 'Google video generation failed.',
      },
    });
    await expect(
      client.submit(compileGoogleDirectRequest(input), context),
    ).rejects.toMatchObject({ isSubmissionUncertain: true });
  });
  it('rejects arbitrary task origins, mismatched polling URLs and synchronous recovery before network', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = new GoogleDirectClient(transport);
    for (const task of [
      { externalId: 'https://evil.example/task' },
      { externalId: operation, pollingUrl: 'https://evil.example/task' },
      { externalId: `${operation}?key=${key}` },
      { externalId: 'interactions/abc' },
    ]) {
      await expect(client.poll(task, context)).rejects.toThrow();
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects missing key, tampered prepared requests and aborted submission before network/callback', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = new GoogleDirectClient(transport);
    const request = compileGoogleDirectRequest(input);
    await expect(client.submit(request, { apiKey: '' })).rejects.toThrow();
    await expect(
      client.submit({ ...request, endpoint: 'https://evil.example' }, context),
    ).rejects.toThrow();
    await expect(
      client.submit(
        { ...request, body: { ...request.body, background: true } },
        context,
      ),
    ).rejects.toThrow();
    const started = vi.fn();
    await expect(
      client.submit(request, {
        ...context,
        signal: AbortSignal.abort(),
        onProviderSubmissionStarted: started,
      }),
    ).rejects.toThrow();
    expect(started).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it('validates credentials with read-only model metadata and redacts failures', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ name: 'models/gemini-3.1-flash-image' }))
      .mockResolvedValueOnce(new Response(key, { status: 403 }));
    const client = new GoogleDirectClient(transport);
    expect(await client.validateCredential(context)).toEqual({ isValid: true });
    expect(await client.validateCredential(context)).toEqual({
      isValid: false,
      error: 'PROVIDER_ACCESS_DENIED',
    });
    expect(transport.mock.calls[0][1]?.method).toBe('GET');
  });
  it('never returns secret-bearing or foreign protected output URLs', async () => {
    for (const uri of [
      `https://generativelanguage.googleapis.com/v1beta/files/a:download?key=${key}`,
      'https://evil.example/video.mp4',
    ]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          done: true,
          response: {
            generateVideoResponse: { generatedSamples: [{ video: { uri } }] },
          },
        }),
      );
      await expect(
        new GoogleDirectClient(transport).poll(
          { externalId: operation },
          context,
        ),
      ).rejects.toThrow();
    }
  });
});
