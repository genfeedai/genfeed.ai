import { BflDirectClient } from '@api/services/integrations/direct-media/bfl/bfl-direct.client';
import { compileBflDirectRequest } from '@api/services/integrations/direct-media/bfl/bfl-direct.contract';
import type { DirectMediaRequestContext } from '@api/services/integrations/direct-media/direct-media.types';
import { describe, expect, it, vi } from 'vitest';

const request = compileBflDirectRequest({
  model: 'flux-2-pro',
  mode: 'text-to-image',
  prompt: 'A bird',
  references: [],
  width: 1024,
  height: 1024,
  seed: 42,
});
const pollingUrl = 'https://api.eu.bfl.ai/v1/get_result?id=task-1';
const task = { externalId: 'task-1', pollingUrl, model: 'flux-2-pro' };
const context: DirectMediaRequestContext = { apiKey: 'fixture-private-key' };
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });

describe('BFL direct client', () => {
  const credentialForms = [
    'fixture-private-key',
    '%66ixture-private-key',
    '%66%69%78%74%75%72%65%2D%70%72%69%76%61%74%65%2D%6B%65%79',
    '%66%69%78%74%75%72%65%2d%70%72%69%76%61%74%65%2d%6b%65%79',
    '%2566%2569%2578%2574%2575%2572%2565%252d%2570%2572%2569%2576%2561%2574%2565%252d%256b%2565%2579',
  ];

  it.each(credentialForms)(
    'rejects reflected submission identity with uncertainty and redacted error: %s',
    async (credential) => {
      const externalId = `task-${credential}`;
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          id: externalId,
          polling_url: `https://api.eu.bfl.ai/v1/get_result?id=${encodeURIComponent(externalId)}`,
        }),
      );
      const result = new BflDirectClient(transport).submit(request, context);
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'BFL returned an unsupported response.',
        isSubmissionUncertain: true,
      });
      await expect(result).rejects.not.toThrow(context.apiKey);
      await expect(result).rejects.not.toThrow(credential);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each(credentialForms)(
    'rejects a reflected polling URL while the returned ID itself is credential-free: %s',
    async (credential) => {
      const externalId = 'task-1';
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          id: externalId,
          polling_url: `https://api.eu.bfl.ai/v1/get_result?id=${externalId}&credential=${credential}`,
        }),
      );
      const result = new BflDirectClient(transport).submit(request, context);
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'BFL returned an unsupported response.',
        isSubmissionUncertain: true,
      });
      await expect(result).rejects.not.toThrow(credential);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each(credentialForms)(
    'rejects credential-bearing recovered identity before GET: %s',
    async (credential) => {
      const externalId = `task-${credential}`;
      const transport = vi.fn<typeof fetch>();
      const result = new BflDirectClient(transport).poll(
        {
          externalId,
          pollingUrl: `https://api.eu.bfl.ai/v1/get_result?id=${encodeURIComponent(externalId)}`,
          model: task.model,
        },
        context,
      );
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_POLL_URL_INVALID',
        message: 'BFL polling URL is unsupported.',
        isSubmissionUncertain: false,
      });
      await expect(result).rejects.not.toThrow(credential);
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it.each(credentialForms)(
    'rejects credential-bearing recovered polling URL before GET: %s',
    async (credential) => {
      const transport = vi.fn<typeof fetch>();
      const result = new BflDirectClient(transport).poll(
        {
          ...task,
          pollingUrl: `${pollingUrl}&credential=${credential}`,
        },
        context,
      );
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_POLL_URL_INVALID',
        message: 'BFL polling URL is unsupported.',
      });
      await expect(result).rejects.not.toThrow(credential);
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it.each(credentialForms)(
    'rejects raw or encoded credential-bearing delivery URLs: %s',
    async (credential) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          id: task.externalId,
          status: 'Ready',
          result: {
            sample: `https://delivery.eu.bfl.ai/output.jpeg?signature=${credential}`,
          },
        }),
      );
      const result = new BflDirectClient(transport).poll(task, context);
      await expect(result).rejects.toMatchObject({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'BFL returned an unsupported response.',
      });
      await expect(result).rejects.not.toThrow(credential);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'https://api.eu.bfl.ai/v1/get_result?id=task-1',
    'https://%61pi.eu.bfl.ai/v1/get_result?id=task-1',
  ])(
    'rejects a credential reflected only in an otherwise allowed polling URL: %s',
    async (url) => {
      const credentialContext = { apiKey: 'api.eu.bfl.ai' };
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ id: task.externalId, polling_url: url }));
      const client = new BflDirectClient(transport);
      await expect(
        client.submit(request, credentialContext),
      ).rejects.toMatchObject({
        code: 'PROVIDER_RESPONSE_INVALID',
        isSubmissionUncertain: true,
      });
      const recovered = client.poll(
        { ...task, pollingUrl: url },
        credentialContext,
      );
      await expect(recovered).rejects.toMatchObject({
        code: 'PROVIDER_POLL_URL_INVALID',
        message: 'BFL polling URL is unsupported.',
      });
      await expect(recovered).rejects.not.toThrow(credentialContext.apiKey);
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves unrelated percent-encoded task IDs and delivery URLs', async () => {
    const externalId = 'task with spaces';
    const pollingUrl =
      'https://api.eu.bfl.ai/v1/get_result?id=task%20with%20spaces';
    const sample =
      'https://delivery.eu.bfl.ai/output%20image.jpeg?signature=safe%2Fvalue';
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ id: externalId, polling_url: pollingUrl }))
      .mockResolvedValueOnce(
        json({ id: externalId, status: 'Ready', result: { sample } }),
      );
    const client = new BflDirectClient(transport);
    await expect(client.submit(request, context)).resolves.toEqual({
      kind: 'task',
      externalId,
      pollingUrl,
      model: task.model,
    });
    await expect(
      client.poll({ externalId, pollingUrl, model: task.model }, context),
    ).resolves.toEqual({
      status: 'succeeded',
      outputs: [{ url: sample, mimeType: 'image/jpeg' }],
    });
    expect(transport.mock.calls[1][0]).toBe(pollingUrl);
  });

  it('submits the compiled payload with x-key, calls the marker immediately before POST, and preserves the provider polling URL', async () => {
    const events: string[] = [];
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
      events.push('post');
      return json({ id: task.externalId, polling_url: pollingUrl });
    });
    expect(
      await new BflDirectClient(transport).submit(request, {
        ...context,
        onProviderSubmissionStarted: () => {
          events.push('marker');
        },
      }),
    ).toEqual({ kind: 'task', ...task });
    expect(events).toEqual(['marker', 'post']);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      request.endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          'x-key': context.apiKey,
        },
        body: JSON.stringify(request.body),
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([
    { provider: 'xai' },
    { endpoint: 'https://attacker.example/v1/flux-2-pro' },
    { model: 'flux-2-pro-preview' },
    { contractVersion: 'unreviewed' },
    { body: { prompt: 'A bird', webhook_url: 'https://attacker.example' } },
    { body: { prompt: 'A bird', width: 1, output_format: 'jpeg' } },
  ])(
    'rejects forged requests before spending or disclosing keys: %j',
    async (override) => {
      const transport = vi.fn<typeof fetch>();
      const marker = vi.fn();
      await expect(
        new BflDirectClient(transport).submit(
          { ...request, ...override } as typeof request,
          { ...context, onProviderSubmissionStarted: marker },
        ),
      ).rejects.toThrow();
      expect(marker).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it('does not mark or submit with a missing key or an already aborted signal', async () => {
    const transport = vi.fn<typeof fetch>();
    const marker = vi.fn();
    const client = new BflDirectClient(transport);
    await expect(
      client.submit(request, {
        apiKey: '',
        onProviderSubmissionStarted: marker,
      }),
    ).rejects.toThrow();
    await expect(
      client.submit(request, {
        ...context,
        signal: AbortSignal.abort(),
        onProviderSubmissionStarted: marker,
      }),
    ).rejects.toThrow();
    expect(marker).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    'http://api.bfl.ai/v1/get_result?id=task-1',
    'https://api.bfl.ai.attacker.example/v1/get_result?id=task-1',
    'https://127.0.0.1/v1/get_result?id=task-1',
    'https://api.bfl.ai:8443/v1/get_result?id=task-1',
    'https://key@api.bfl.ai/v1/get_result?id=task-1',
    'https://api.bfl.ai/v1/credits?id=task-1',
    'https://api.bfl.ai/v1/get_result?id=task-1&x-key=secret',
    'https://api.bfl.ai/v1/get_result?id=other',
    'https://api.bfl.ai/v1/get_result?id=task-1&id=task-1',
    'https://api.bfl.ai/v1/get_result?id=task-1#fragment',
    'https://api.bfl.ai/v1/get_result',
  ])('refuses unsafe polling URLs before network access: %s', async (url) => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      new BflDirectClient(transport).poll(
        { ...task, pollingUrl: url },
        context,
      ),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(['api.bfl.ai', 'api.eu.bfl.ai', 'api.us.bfl.ai'])(
    'uses the returned verified polling origin %s',
    async (host) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ id: task.externalId, status: 'Pending' }));
      const url = `https://${host}/v1/get_result?id=task-1`;
      expect(
        await new BflDirectClient(transport).poll(
          { ...task, pollingUrl: url },
          context,
        ),
      ).toEqual({ status: 'queued' });
      expect(transport).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'GET',
          headers: { accept: 'application/json', 'x-key': context.apiKey },
          redirect: 'error',
        }),
      );
    },
  );
  it.each([
    ['Reasoning', 'running'],
    ['Generating', 'running'],
    ['Pending', 'queued'],
  ])('maps %s to %s', async (status, expected) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: task.externalId, status }));
    expect(await new BflDirectClient(transport).poll(task, context)).toEqual({
      status: expected,
    });
  });
  it('returns the expiring delivery URL without credential attachment or refreshing/downloading it', async () => {
    const sample =
      'https://delivery.eu.bfl.ai/output.jpeg?expires=1&signature=fixture';
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ id: task.externalId, status: 'Ready', result: { sample } }),
      );
    expect(await new BflDirectClient(transport).poll(task, context)).toEqual({
      status: 'succeeded',
      outputs: [{ url: sample, mimeType: 'image/jpeg' }],
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    'Failed',
    'Error',
    'Request Moderated',
    'Content Moderated',
    'Task not found',
  ])('maps %s to explicit redacted failure', async (status) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ id: task.externalId, status, details: context.apiKey }),
      );
    const result = await new BflDirectClient(transport).poll(task, context);
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(context.apiKey);
  });
  it.each([
    { id: task.externalId, status: 'Mystery' },
    { id: 'other', status: 'Pending' },
    { id: task.externalId, status: 'Ready' },
    {
      id: task.externalId,
      status: 'Ready',
      result: { sample: 'http://delivery.eu.bfl.ai/image.jpeg' },
    },
  ])(
    'rejects malformed results without inventing success: %j',
    async (body) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(json(body));
      await expect(
        new BflDirectClient(transport).poll(task, context),
      ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    },
  );
  it.each([
    { id: task.externalId },
    { polling_url: pollingUrl },
    { id: task.externalId, polling_url: 'https://attacker.example' },
  ])('marks malformed acknowledgements uncertain: %j', async (body) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(body));
    await expect(
      new BflDirectClient(transport).submit(request, context),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      isSubmissionUncertain: true,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, 'PROVIDER_ACCESS_DENIED'],
    [402, 'PROVIDER_CREDIT_REQUIRED'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ])('redacts HTTP %s errors as %s without retrying', async (status, code) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(context.apiKey, { status: Number(status) }),
      );
    const promise = new BflDirectClient(transport).submit(request, context);
    await expect(promise).rejects.toMatchObject({
      code,
      isSubmissionUncertain: status === 503,
    });
    await expect(promise).rejects.not.toThrow(context.apiKey);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects redirect responses without exposing provider bodies', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(context.apiKey, {
        status: 302,
        headers: { Location: 'https://attacker.example' },
      }),
    );
    const promise = new BflDirectClient(transport).poll(task, context);
    await expect(promise).rejects.toMatchObject({
      code: 'PROVIDER_REQUEST_REJECTED',
    });
    await expect(promise).rejects.not.toThrow(context.apiKey);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('keeps the reviewed payload immutable even if a caller mutates its body in the submission callback', async () => {
    const mutable = { ...request, body: { ...request.body } };
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ id: task.externalId, polling_url: pollingUrl }),
      );
    await new BflDirectClient(transport).submit(mutable, {
      ...context,
      onProviderSubmissionStarted: () => {
        mutable.body.prompt = 'mutated';
        mutable.endpoint = 'https://attacker.example';
      },
    });
    expect(transport).toHaveBeenCalledWith(
      request.endpoint,
      expect.objectContaining({ body: JSON.stringify(request.body) }),
    );
  });
  it('does not retry an ambiguous network failure or expose a raw provider error', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(context.apiKey));
    const promise = new BflDirectClient(transport).submit(request, context);
    await expect(promise).rejects.toMatchObject({
      code: 'PROVIDER_CONNECTION_FAILED',
      isSubmissionUncertain: true,
    });
    await expect(promise).rejects.not.toThrow(context.apiKey);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('validates credentials through nonpaid credits even when the balance is zero', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ credits: 0 }));
    expect(
      await new BflDirectClient(transport).validateCredential(context),
    ).toEqual({ isValid: true });
    expect(transport).toHaveBeenCalledWith(
      'https://api.bfl.ai/v1/credits',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json', 'x-key': context.apiKey },
      }),
    );
  });
  it.each([
    new Response('private body', { status: 401 }),
    new Response('private body', { status: 429 }),
    json({}),
    json({ credits: '10' }),
  ])(
    'fails closed on credential errors or malformed credits',
    async (response) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      const result = await new BflDirectClient(transport).validateCredential(
        context,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(JSON.stringify(result)).not.toContain(context.apiKey);
    },
  );
  it('fails missing credentials locally and reports remote cancellation unsupported without network', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = new BflDirectClient(transport);
    expect((await client.validateCredential({ apiKey: ' ' })).isValid).toBe(
      false,
    );
    expect(await client.cancel(task, context)).toEqual({
      status: 'unsupported',
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
