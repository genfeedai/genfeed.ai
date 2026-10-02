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
