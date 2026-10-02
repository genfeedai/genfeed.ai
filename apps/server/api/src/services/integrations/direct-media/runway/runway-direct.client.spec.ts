import { RunwayDirectClient } from '@api/services/integrations/direct-media/runway/runway-direct.client';
import { compileRunwayDirectRequest } from '@api/services/integrations/direct-media/runway/runway-direct.contract';
import { describe, expect, it, vi } from 'vitest';

const id = '12345678-1234-4234-8234-123456789abc';
const context = { apiKey: 'fixture-private-key' };
const prepared = () =>
  compileRunwayDirectRequest({
    model: 'gen4.5',
    mode: 'text-to-video',
    prompt: 'Cloud',
    references: [],
    aspectRatio: '1280:720',
    durationSeconds: 3,
  });
const json = (value: unknown) => new Response(JSON.stringify(value));
describe('Runway direct client', () => {
  const credentialForms = [
    'fixture-private-key',
    '%66ixture-private-key',
    '%66%69%78%74%75%72%65%2D%70%72%69%76%61%74%65%2D%6B%65%79',
    '%66%69%78%74%75%72%65%2d%70%72%69%76%61%74%65%2d%6b%65%79',
    '%2566%2569%2578%2574%2575%2572%2565%252d%2570%2572%2569%2576%2561%2574%2565%252d%256b%2565%2579',
  ];

  it('rejects a UUID-looking credential returned as the paid task ID', async () => {
    const credentialContext = { apiKey: id };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json({ id }));
    const result = new RunwayDirectClient(transport).submit(
      prepared(),
      credentialContext,
    );
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'Runway returned an invalid response.',
      isSubmissionUncertain: true,
    });
    await expect(result).rejects.not.toThrow(id);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects a UUID-looking credential in recovered identity before polling or cancellation', async () => {
    const credentialContext = { apiKey: id };
    const transport = vi.fn<typeof fetch>();
    const client = new RunwayDirectClient(transport);
    for (const operation of [
      () => client.poll({ externalId: id }, credentialContext),
      () => client.cancel({ externalId: id }, credentialContext),
    ]) {
      const result = operation();
      await expect(result).rejects.toMatchObject({
        code: 'RUNWAY_TASK_INVALID',
        message: 'Invalid Runway task identity.',
      });
      await expect(result).rejects.not.toThrow(id);
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects a UUID-looking credential in returned result identity for a different recovered task', async () => {
    const credentialContext = { apiKey: id };
    const externalId = '87654321-1234-4234-8234-123456789abc';
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id, status: 'RUNNING' }));
    const result = new RunwayDirectClient(transport).poll(
      { externalId },
      credentialContext,
    );
    await expect(result).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'Runway returned an invalid response.',
    });
    await expect(result).rejects.not.toThrow(id);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(credentialForms)(
    'rejects reflected returned result IDs before state handling: %s',
    async (credential) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          id: credential,
          status: 'RUNNING',
        }),
      );
      const client = new RunwayDirectClient(transport);
      for (const operation of [
        () => client.poll({ externalId: id }, context),
        () => client.cancel({ externalId: id }, context),
      ]) {
        const result = operation();
        await expect(result).rejects.toMatchObject({
          code: 'PROVIDER_RESPONSE_INVALID',
          message: 'Runway returned an invalid response.',
        });
        await expect(result).rejects.not.toThrow(credential);
      }
      expect(transport).toHaveBeenCalledTimes(2);
      expect(
        transport.mock.calls.every((call) => call[1]?.method === 'GET'),
      ).toBe(true);
    },
  );

  it.each(credentialForms)(
    'rejects raw or encoded credentials in succeeded output URLs: %s',
    async (credential) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          status: 'SUCCEEDED',
          output: [`https://cdn.example/output.mp4?signature=${credential}`],
        }),
      );
      const result = new RunwayDirectClient(transport).poll(
        { externalId: id },
        context,
      );
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'Runway returned an invalid response.',
      });
      await expect(result).rejects.not.toThrow(credential);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves unrelated percent-encoded output URLs', async () => {
    const output =
      'https://cdn.example/output%20video.mp4?signature=safe%2Fvalue';
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id, status: 'SUCCEEDED', output: [output] }));
    await expect(
      new RunwayDirectClient(transport).poll({ externalId: id }, context),
    ).resolves.toEqual({ status: 'succeeded', outputs: [{ url: output }] });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('submits exactly once to the fixed host and signals the paid boundary', async () => {
    const order: string[] = [];
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
      order.push('http');
      return json({ id });
    });
    expect(
      await new RunwayDirectClient(transport).submit(prepared(), {
        ...context,
        onProviderSubmissionStarted: () => order.push('started'),
      }),
    ).toEqual({ kind: 'task', externalId: id, model: 'gen4.5' });
    expect(order).toEqual(['started', 'http']);
    expect(transport).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/text_to_video',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: `Bearer ${context.apiKey}`,
          'X-Runway-Version': '2024-11-06',
        }),
        body: JSON.stringify(prepared().body),
      }),
    );
  });
  it('rejects forged prepared requests and unsafe task identity before HTTP', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = new RunwayDirectClient(transport);
    for (const request of [
      { ...prepared(), provider: 'xai' as const },
      { ...prepared(), endpoint: 'https://evil.example' },
      { ...prepared(), body: { ...prepared().body, extra: 'ignored-control' } },
    ])
      await expect(client.submit(request, context)).rejects.toThrow();
    await expect(
      client.poll({ externalId: '../secret' }, context),
    ).rejects.toThrow();
    await expect(
      client.cancel(
        { externalId: id, pollingUrl: 'https://evil.example' },
        context,
      ),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    'PENDING',
    'THROTTLED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED',
  ])('maps %s without exposing provider failure text', async (status) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        status,
        output: ['https://cdn.example/output.mp4'],
        failure: context.apiKey,
        failureCode: context.apiKey,
      }),
    );
    const result = await new RunwayDirectClient(transport).poll(
      { externalId: id },
      context,
    );
    expect(result.status).toBe(
      (
        {
          PENDING: 'queued',
          THROTTLED: 'queued',
          RUNNING: 'running',
          SUCCEEDED: 'succeeded',
          FAILED: 'failed',
          CANCELLED: 'cancelled',
        } as const
      )[status as 'PENDING'],
    );
    expect(JSON.stringify(result)).not.toContain(context.apiKey);
  });
  it.each(['SUCCEEDED', 'FAILED', 'CANCELLED'])(
    'never deletes known terminal %s tasks',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ status }));
      expect(
        await new RunwayDirectClient(transport).cancel(
          { externalId: id },
          context,
        ),
      ).toEqual({
        status: status === 'CANCELLED' ? 'confirmed' : 'unsupported',
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['PENDING', 'THROTTLED', 'RUNNING'])(
    'requests remote cancellation for %s and waits for confirmation',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ status }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      expect(
        await new RunwayDirectClient(transport).cancel(
          { externalId: id },
          context,
        ),
      ).toEqual({ status: 'requested' });
      expect(transport.mock.calls.map((call) => call[1]?.method)).toEqual([
        'GET',
        'DELETE',
      ]);
    },
  );
  it('handles a terminal race/404 without claiming cancellation', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ status: 'RUNNING' }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(
      new RunwayDirectClient(transport).cancel({ externalId: id }, context),
    ).rejects.toMatchObject({ code: 'PROVIDER_REQUEST_REJECTED' });
  });
  it('validates credentials using a free organization read', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ creditBalance: 0 }));
    expect(
      await new RunwayDirectClient(transport).validateCredential(context),
    ).toEqual({ isValid: true });
    expect(transport).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/organization',
      expect.objectContaining({ method: 'GET' }),
    );
  });
  it.each([
    [401, 'PROVIDER_ACCESS_DENIED'],
    [402, 'PROVIDER_CREDIT_REQUIRED'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ])('redacts HTTP %s errors', async (status, code) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(context.apiKey, { status: Number(status) }),
      );
    const result = new RunwayDirectClient(transport).submit(
      prepared(),
      context,
    );
    await expect(result).rejects.toMatchObject({
      code,
      isSubmissionUncertain: status === 503,
    });
    await expect(result).rejects.not.toThrow(context.apiKey);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('redacts uncertain transport failure and does not retry', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(context.apiKey));
    await expect(
      new RunwayDirectClient(transport).submit(prepared(), context),
    ).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_FAILED',
      isSubmissionUncertain: true,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not treat local abort as remote cancellation or signal paid start', async () => {
    const transport = vi.fn<typeof fetch>();
    const started = vi.fn();
    await expect(
      new RunwayDirectClient(transport).submit(prepared(), {
        ...context,
        signal: AbortSignal.abort(),
        onProviderSubmissionStarted: started,
      }),
    ).rejects.toThrow();
    expect(started).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it('redacts denied credentials and unknown task states', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(context.apiKey, { status: 401 }))
      .mockResolvedValueOnce(json({ status: context.apiKey }));
    const client = new RunwayDirectClient(transport);
    expect(await client.validateCredential(context)).toEqual({
      isValid: false,
      error: 'PROVIDER_ACCESS_DENIED',
    });
    await expect(
      client.cancel({ externalId: id }, context),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    expect(
      transport.mock.calls.every((call) => call[1]?.method === 'GET'),
    ).toBe(true);
  });
  it.each([{}, { id: '../escape' }, []])(
    'marks malformed paid submission response uncertain: %j',
    async (response) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(json(response));
      await expect(
        new RunwayDirectClient(transport).submit(prepared(), context),
      ).rejects.toMatchObject({
        code: 'PROVIDER_RESPONSE_INVALID',
        isSubmissionUncertain: true,
      });
    },
  );
  it.each([
    'http://cdn.example/result.mp4',
    'https://user:secret@cdn.example/result.mp4',
    'invalid-url',
  ])('rejects unsafe output %s', async (output) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ status: 'SUCCEEDED', output: [output] }));
    await expect(
      new RunwayDirectClient(transport).poll({ externalId: id }, context),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });
});
