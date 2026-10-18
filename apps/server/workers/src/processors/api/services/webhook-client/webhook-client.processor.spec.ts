import { createHmac } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { ClientRequest, Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Duplex, Readable } from 'node:stream';
import type { HttpService } from '@nestjs/axios';
import { WebhookClientProcessor } from '@workers/processors/api/services/webhook-client/webhook-client.processor';
import { UnrecoverableError } from 'bullmq';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

type WebhookRequestOptions = NonNullable<Parameters<HttpService['post']>[2]>;

const disposeFixtures: Array<() => void> = [];

function createMemoryResponse(
  endpoint: string,
  payload: unknown,
  options: WebhookRequestOptions,
  status = 200,
  holdUpload = false,
) {
  const agent: unknown = options.httpsAgent ?? options.httpAgent;
  if (!(agent instanceof HttpAgent))
    throw new Error('Expected the real pinned HTTP agent');
  const pendingWrites: Array<() => void> = [];
  const socket = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      if (holdUpload) pendingWrites.push(callback);
      else callback();
    },
  });
  // Only an in-memory Duplex is ever attached: no socket connect, DNS or TLS.
  agent.createConnection = () => socket;
  const url = new URL(endpoint);
  const request = new ClientRequest({
    agent,
    host: url.hostname,
    method: 'POST',
    path: url.pathname,
    protocol: url.protocol,
  });
  request.on('error', () => undefined);
  request.end(JSON.stringify(payload));
  const readBody = vi.fn();
  const body = new Readable({ read: readBody });
  disposeFixtures.push(() => {
    request.destroy();
    socket.destroy();
    body.destroy();
    agent.destroy();
  });
  return {
    agent,
    body,
    finishUpload() {
      holdUpload = false;
      for (const finish of pendingWrites.splice(0)) finish();
    },
    readBody,
    request,
    response: { data: body, request, status },
  };
}

function createJob(endpoint = 'http://8.8.8.8/webhook') {
  return {
    attemptsMade: 0,
    data: {
      endpoint,
      organizationId: 'org-1',
      payload: { event: 'target.published', timestamp: '2026-10-18T00:00:00Z' },
      secret: 'dummy-webhook-key',
    },
    id: 'bounded-webhook-job',
    opts: { attempts: 5 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  };
}

const flushTransport = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe('WebhookClientProcessor', () => {
  let httpService: { post: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let organizationSettingsService: {
    recordWebhookDeliveryStatus: ReturnType<typeof vi.fn>;
  };
  let processor: WebhookClientProcessor;

  beforeEach(() => {
    dnsLookupMock.mockReset();
    vi.spyOn(HttpAgent.prototype, 'createConnection').mockImplementation(() => {
      throw new Error('Real network connections are disabled');
    });
    vi.spyOn(HttpsAgent.prototype, 'createConnection').mockImplementation(
      () => {
        throw new Error('Real TLS connections are disabled');
      },
    );
    httpService = {
      post: vi.fn(
        (endpoint: string, payload: unknown, options: WebhookRequestOptions) =>
          of(createMemoryResponse(endpoint, payload, options).response),
      ),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    organizationSettingsService = {
      recordWebhookDeliveryStatus: vi.fn().mockResolvedValue(undefined),
    };
    processor = new WebhookClientProcessor(
      httpService as never,
      logger as never,
      organizationSettingsService as never,
    );
  });

  afterEach(() => {
    for (const dispose of disposeFixtures.splice(0)) dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('bounded acknowledgement transport', () => {
    it('never reads the acknowledgement and disposes the stream and pinned agent', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const fixtures: ReturnType<typeof createMemoryResponse>[] = [];
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(endpoint, payload, options);
          vi.spyOn(fixture.agent, 'destroy');
          fixtures.push(fixture);
          return of(fixture.response);
        },
      );
      const job = createJob();
      await processor.process(job as never);
      await flushTransport();
      const fixture = fixtures[0];
      expect(httpService.post.mock.calls[0]?.[2]).toMatchObject({
        responseType: 'stream',
        signal: expect.any(AbortSignal),
        timeout: 30_000,
      });
      expect(fixture?.readBody).not.toHaveBeenCalled();
      expect(fixture?.body.destroyed).toBe(true);
      expect(fixture?.agent.destroy).toHaveBeenCalledOnce();
      expect(fixture?.request.writableFinished).toBe(true);
      expect(httpService.post.mock.calls[0]?.[2]?.headers).toMatchObject({
        'X-Genfeed-Signature': `sha256=${createHmac('sha256', job.data.secret).update(JSON.stringify(job.data.payload)).digest('hex')}`,
      });
      const signal: unknown = httpService.post.mock.calls[0]?.[2]?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      if (signal instanceof AbortSignal)
        expect(getEventListeners(signal, 'abort')).toHaveLength(0);
      expect(fixture?.body.listenerCount('error')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('waits for payload flush when accepted headers arrive while writableEnded is true', async () => {
      const fixtures: ReturnType<typeof createMemoryResponse>[] = [];
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            200,
            true,
          );
          fixtures.push(fixture);
          return of(fixture.response);
        },
      );
      let settled = false;
      const delivery = processor.process(createJob() as never).finally(() => {
        settled = true;
      });
      await flushTransport();
      const fixture = fixtures[0];
      expect(fixture?.request.writableEnded).toBe(true);
      expect(fixture?.request.writableFinished).toBe(false);
      expect(settled).toBe(false);
      expect(fixture?.body.destroyed).toBe(false);
      fixture?.finishUpload();
      await delivery;
      expect(fixture?.body.destroyed).toBe(true);
      expect(
        organizationSettingsService.recordWebhookDeliveryStatus,
      ).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ status: 'delivered' }),
      );
    });

    it('rejects early 4xx immediately without awaiting or retrying the pending upload', async () => {
      const fixtures: ReturnType<typeof createMemoryResponse>[] = [];
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            422,
            true,
          );
          fixtures.push(fixture);
          return of(fixture.response);
        },
      );
      await processor.process(createJob() as never);
      const fixture = fixtures[0];
      expect(fixture?.body.destroyed).toBe(true);
      expect(fixture?.request.destroyed).toBe(true);
      expect(
        organizationSettingsService.recordWebhookDeliveryStatus,
      ).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ status: 'rejected', statusCode: 422 }),
      );
    });

    it('disposes a retryable Axios status-error body without replacing sanitized failure', async () => {
      const bodies: Readable[] = [];
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            503,
            true,
          );
          bodies.push(fixture.body);
          const error = Object.assign(
            new Error('upstream 503 api_key=must-redact'),
            {
              response: fixture.response,
            },
          );
          return throwError(() => error);
        },
      );
      await expect(processor.process(createJob() as never)).rejects.toThrow(
        'upstream 503 api_key=[REDACTED]',
      );
      expect(bodies[0]?.destroyed).toBe(true);
      expect(
        organizationSettingsService.recordWebhookDeliveryStatus,
      ).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ status: 'failed', statusCode: 503 }),
      );
    });

    it('fails safely when an accepted response has no outgoing request identity', async () => {
      const body = new Readable({ read() {} });
      disposeFixtures.push(() => body.destroy());
      httpService.post.mockReturnValue(of({ data: body, status: 200 }));
      await expect(processor.process(createJob() as never)).rejects.toThrow();
      expect(body.destroyed).toBe(true);
      expect(
        organizationSettingsService.recordWebhookDeliveryStatus,
      ).not.toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ status: 'delivered' }),
      );
    });

    it('fails safely for a closed request whose outgoing payload did not finish', async () => {
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            200,
            true,
          );
          fixture.request.destroy();
          return of(fixture.response);
        },
      );
      await expect(processor.process(createJob() as never)).rejects.toThrow();
      expect(
        organizationSettingsService.recordWebhookDeliveryStatus,
      ).not.toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ status: 'delivered' }),
      );
    });

    it('does not lose an outgoing error after headers or leak request listeners', async () => {
      const fixtures: ReturnType<typeof createMemoryResponse>[] = [];
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            200,
            true,
          );
          fixtures.push(fixture);
          return of(fixture.response);
        },
      );
      const delivery = processor.process(createJob() as never).then(
        () => undefined,
        (error: unknown) => error,
      );
      await flushTransport();
      fixtures[0]?.request.destroy(
        new Error('upload failed token=must-redact'),
      );
      expect(await delivery).toMatchObject({
        message: 'upload failed token=[REDACTED]',
      });
      await flushTransport();
      expect(fixtures[0]?.request.listenerCount('finish')).toBe(0);
      expect(fixtures[0]?.body.destroyed).toBe(true);
    });

    it('expires DNS validation and prevents late answers from starting HTTP', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      let resolveDns: (
        addresses: Array<{ address: string; family: number }>,
      ) => void = () => undefined;
      dnsLookupMock.mockReturnValue(
        new Promise((resolve) => {
          resolveDns = resolve;
        }),
      );
      let failure: unknown;
      let settled = false;
      const delivery = processor
        .process(createJob('https://hooks.example.com/webhook') as never)
        .catch((error: unknown) => {
          failure = error;
        })
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(true);
      await delivery;
      expect(failure).toBeInstanceOf(Error);
      resolveDns([{ address: '93.184.216.34', family: 4 }]);
      await flushTransport();
      expect(httpService.post).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('expires pending acquisition, cancels its subscription and destroys the agent', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const unsubscribed = vi.fn();
      const agents: HttpAgent[] = [];
      httpService.post.mockImplementation(
        (
          _endpoint: string,
          _payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const agent: unknown = options.httpAgent;
          if (agent instanceof HttpAgent) {
            agents.push(agent);
            vi.spyOn(agent, 'destroy');
          }
          return new Observable(() => unsubscribed);
        },
      );
      let settled = false;
      const delivery = processor
        .process(createJob() as never)
        .catch(() => undefined)
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(true);
      await delivery;
      expect(unsubscribed).toHaveBeenCalledOnce();
      expect(agents[0]?.destroy).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('expires accepted headers with a pending payload and clears transport resources', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const fixtures: ReturnType<typeof createMemoryResponse>[] = [];
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            200,
            true,
          );
          fixtures.push(fixture);
          return of(fixture.response);
        },
      );
      let settled = false;
      const delivery = processor
        .process(createJob() as never)
        .catch(() => undefined)
        .finally(() => {
          settled = true;
        });
      await flushTransport();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(true);
      await delivery;
      await flushTransport();
      expect(fixtures[0]?.body.destroyed).toBe(true);
      expect(fixtures[0]?.request.destroyed).toBe(true);
      expect(fixtures[0]?.request.listenerCount('finish')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(
        organizationSettingsService.recordWebhookDeliveryStatus,
      ).not.toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ status: 'delivered' }),
      );
    });

    it('uses one budget across DNS and header acquisition instead of restarting the timeout', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      dnsLookupMock.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve([{ address: '93.184.216.34', family: 4 }]),
              10_000,
            ),
          ),
      );
      httpService.post.mockReturnValue(new Observable(() => undefined));
      let settled = false;
      const delivery = processor
        .process(createJob('https://hooks.example.com/webhook') as never)
        .catch(() => undefined)
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(httpService.post).toHaveBeenCalledOnce();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(settled).toBe(true);
      await delivery;
      expect(vi.getTimerCount()).toBe(0);
    });

    it('retains an error from the response while the outgoing payload is pending', async () => {
      const fixtures: ReturnType<typeof createMemoryResponse>[] = [];
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            200,
            true,
          );
          fixtures.push(fixture);
          return of(fixture.response);
        },
      );
      const delivery = processor.process(createJob() as never).then(
        () => undefined,
        (error: unknown) => error,
      );
      await flushTransport();
      fixtures[0]?.body.emit(
        'error',
        new Error('response failed token=must-redact'),
      );
      expect(await delivery).toMatchObject({
        message: 'response failed token=[REDACTED]',
      });
      await flushTransport();
      expect(fixtures[0]?.body.listenerCount('error')).toBe(0);
      expect(fixtures[0]?.request.listenerCount('finish')).toBe(0);
    });

    it('keeps a successful acknowledgement when agent cleanup throws', async () => {
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(endpoint, payload, options);
          vi.spyOn(fixture.agent, 'destroy').mockImplementationOnce(() => {
            throw new Error('cleanup failure');
          });
          return of(fixture.response);
        },
      );
      await expect(
        processor.process(createJob() as never),
      ).resolves.toBeUndefined();
      expect(
        organizationSettingsService.recordWebhookDeliveryStatus,
      ).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ status: 'delivered' }),
      );
    });

    it('preserves the status failure when response and agent cleanup throw', async () => {
      httpService.post.mockImplementation(
        (
          endpoint: string,
          payload: unknown,
          options: WebhookRequestOptions,
        ) => {
          const fixture = createMemoryResponse(
            endpoint,
            payload,
            options,
            503,
            true,
          );
          vi.spyOn(fixture.body, 'destroy').mockImplementationOnce(() => {
            throw new Error('body cleanup failure');
          });
          vi.spyOn(fixture.agent, 'destroy').mockImplementationOnce(() => {
            throw new Error('agent cleanup failure');
          });
          const error = Object.assign(
            new Error('upstream failed token=must-redact'),
            {
              response: fixture.response,
            },
          );
          return throwError(() => error);
        },
      );
      await expect(processor.process(createJob() as never)).rejects.toThrow(
        'upstream failed token=[REDACTED]',
      );
    });

    it.each([10, 30, 100])(
      'cleans resources when progress %s fails without masking the error',
      async (progress) => {
        const destroyed = vi.spyOn(HttpAgent.prototype, 'destroy');
        const job = createJob();
        job.updateProgress.mockImplementation(async (value: number) => {
          if (value === progress)
            throw new Error('progress failed token=must-redact');
        });
        await expect(processor.process(job as never)).rejects.toThrow(
          'progress failed token=[REDACTED]',
        );
        if (progress >= 30) expect(destroyed).toHaveBeenCalled();
      },
    );
  });

  it('pins HTTPS dispatch to the validated addresses while preserving Host and SNI', async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://hooks.example.com/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-https-pinned',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await processor.process(job as never);

    const [requestUrl, _payload, requestOptions] =
      httpService.post.mock.calls[0] ?? [];
    expect(requestUrl).toBe('https://hooks.example.com/webhook');
    expect(requestOptions).toMatchObject({
      headers: {
        Host: 'hooks.example.com',
      },
      httpsAgent: expect.any(Object),
      maxRedirects: 0,
      timeout: 30000,
    });
    expect(requestOptions.httpAgent).toBeUndefined();
    expect(requestOptions.httpsAgent.options.servername).toBe(
      'hooks.example.com',
    );

    dnsLookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await new Promise<void>((resolve, reject) => {
      requestOptions.httpsAgent.options.lookup(
        'hooks.example.com',
        { all: true },
        (error: Error | null, addresses: unknown) => {
          if (error) {
            reject(error);
            return;
          }

          expect(addresses).toEqual([
            { address: '93.184.216.34', family: 4 },
            { address: '2606:4700:4700::1111', family: 6 },
          ]);
          resolve();
        },
      );
    });
    expect(dnsLookupMock).toHaveBeenCalledTimes(1);
  });

  it('pins HTTP dispatch to a public IPv6 literal', async () => {
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'http://[2606:4700:4700::1111]/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-http-ipv6-pinned',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await processor.process(job as never);

    const requestOptions = httpService.post.mock.calls[0]?.[2];
    expect(requestOptions).toMatchObject({
      headers: {
        Host: '[2606:4700:4700::1111]',
      },
      httpAgent: expect.any(Object),
    });
    expect(requestOptions.httpsAgent).toBeUndefined();
    expect(dnsLookupMock).not.toHaveBeenCalled();

    await new Promise<void>((resolve, reject) => {
      requestOptions.httpAgent.options.lookup(
        '2606:4700:4700::1111',
        {},
        (error: Error | null, address: string, family: number) => {
          if (error) {
            reject(error);
            return;
          }

          expect(address).toBe('2606:4700:4700::1111');
          expect(family).toBe(6);
          resolve();
        },
      );
    });
  });

  it('fails closed without dispatch when DNS returns no public addresses', async () => {
    dnsLookupMock.mockResolvedValueOnce([]);
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://hooks.example.com/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-empty-dns',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(job as never)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('rejects unsafe webhook endpoints before dispatch', async () => {
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'http://127.0.0.1/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-1',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    const delivery = processor.process(job as never);
    await expect(delivery).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(delivery).rejects.toThrow(
      'Webhook endpoint cannot target private or reserved IPs',
    );

    expect(httpService.post).not.toHaveBeenCalled();
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'job-1',
        event: 'ingredient.generated',
        status: 'failed',
      }),
    );
  });

  it('disables redirects when dispatching webhooks', async () => {
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-1',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await processor.process(job as never);

    expect(httpService.post).toHaveBeenCalledWith(
      'https://8.8.8.8/webhook',
      expect.any(Object),
      expect.objectContaining({
        maxRedirects: 0,
      }),
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'job-1',
        event: 'ingredient.generated',
        status: 'delivered',
        statusCode: 200,
      }),
    );
  });

  it('records retryable HTTP failure status codes', async () => {
    const error = new Error(
      'Request failed with status code 503 api_key=raw-provider-key',
    ) as Error & {
      response: { status: number };
    };
    error.response = { status: 503 };
    httpService.post.mockReturnValueOnce(throwError(() => error));

    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'ingredient.generated',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'job-1',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'Request failed with status code 503 api_key=[REDACTED]',
    );

    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'job-1',
        error: 'Request failed with status code 503 api_key=[REDACTED]',
        event: 'ingredient.generated',
        status: 'failed',
        statusCode: 503,
      }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'raw-provider-key',
    );
  });

  it('records 4xx responses as rejected without triggering a retry', async () => {
    httpService.post.mockReturnValueOnce(of({ status: 422 }));
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.failed',
          eventId: 'publish:target.failed:release-1:target-1:failed',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-rejected',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(job as never)).resolves.toBeUndefined();

    const requestOptions = httpService.post.mock.calls[0]?.[2];
    expect(requestOptions.validateStatus(422)).toBe(true);
    expect(requestOptions.validateStatus(503)).toBe(false);
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'publish-webhook-rejected',
        event: 'target.failed',
        status: 'rejected',
        statusCode: 422,
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('webhook rejected by endpoint'),
      expect.objectContaining({
        jobId: 'publish-webhook-rejected',
        organizationId: 'org-1',
        statusCode: 422,
      }),
    );
  });

  it('rethrows delivery failures so BullMQ retries the webhook job', async () => {
    const error = new Error(
      'upstream 503 oauth_token=raw-oauth-token webhook_secret=raw-webhook-secret',
    );
    httpService.post.mockReturnValue(throwError(() => error));
    const job = {
      attemptsMade: 1,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.failed',
          eventId: 'publish:target.failed:release-1:target-1:failed',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish:target.failed:release-1:target-1:failed',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'upstream 503 oauth_token=[REDACTED] webhook_secret=[REDACTED]',
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('webhook delivery failed'),
      expect.objectContaining({
        attempt: 2,
        event: 'target.failed',
        jobId: 'publish:target.failed:release-1:target-1:failed',
        maxAttempts: 5,
        organizationId: 'org-1',
      }),
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 2,
        deliveryId: 'publish:target.failed:release-1:target-1:failed',
        error: 'upstream 503 oauth_token=[REDACTED] webhook_secret=[REDACTED]',
        status: 'failed',
      }),
    );
    const diagnostics = JSON.stringify({
      logs: logger.error.mock.calls,
      statuses:
        organizationSettingsService.recordWebhookDeliveryStatus.mock.calls,
    });
    expect(diagnostics).not.toContain('raw-oauth-token');
    expect(diagnostics).not.toContain('raw-webhook-secret');
  });

  it('does not serialize arbitrary thrown objects into webhook diagnostics', async () => {
    httpService.post.mockReturnValue(
      throwError(() => ({ privatePayload: 'must-not-be-persisted' })),
    );
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.failed',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-object-error',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'Webhook delivery failed',
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ error: 'Webhook delivery failed' }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'must-not-be-persisted',
    );
  });

  it('uses the bounded timeout and rethrows a sanitized timeout for retry', async () => {
    const error = Object.assign(
      new Error('timeout after 30000ms access_token=raw-access-token'),
      { code: 'ECONNABORTED' },
    );
    httpService.post.mockReturnValueOnce(throwError(() => error));
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.published',
          eventId: 'publish:target.published:release-1:target-1:published',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-timeout',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processor.process(job as never)).rejects.toThrow(
      'timeout after 30000ms access_token=[REDACTED]',
    );

    expect(httpService.post).toHaveBeenCalledWith(
      'https://8.8.8.8/webhook',
      expect.any(Object),
      expect.objectContaining({
        timeout: 30000,
      }),
    );
    expect(
      organizationSettingsService.recordWebhookDeliveryStatus,
    ).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        attempt: 1,
        deliveryId: 'publish-webhook-timeout',
        error: 'timeout after 30000ms access_token=[REDACTED]',
        status: 'failed',
      }),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'raw-access-token',
    );
  });

  it('redacts status persistence diagnostics', async () => {
    organizationSettingsService.recordWebhookDeliveryStatus.mockRejectedValueOnce(
      new Error('write failed session_token=raw-session-token'),
    );
    const job = {
      attemptsMade: 0,
      data: {
        endpoint: 'https://8.8.8.8/webhook',
        organizationId: 'org-1',
        payload: {
          event: 'target.published',
          timestamp: '2026-05-17T10:00:00.000Z',
        },
        secret: 'secret',
      },
      id: 'publish-webhook-status-log',
      opts: { attempts: 5 },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    await processor.process(job as never);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to record status'),
      expect.objectContaining({
        deliveryId: 'publish-webhook-status-log',
        error: 'write failed session_token=[REDACTED]',
        organizationId: 'org-1',
      }),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'raw-session-token',
    );
  });
});
