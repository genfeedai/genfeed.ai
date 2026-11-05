import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichWideEvent, recordWideEventError } from './wide-event.context';
import { createWideEventMiddleware } from './wide-event.http';
import type { WideEventRecord } from './wide-event.interface';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT_SPAN_ID = '00f067aa0ba902b7';

describe('createWideEventMiddleware', () => {
  let server: Server;
  let baseUrl: string;
  let events: WideEventRecord[];

  /** Resolves once the response has been sent and the event had its chance to emit. */
  async function request(
    path: string,
    init?: RequestInit,
  ): Promise<{ response: Response; body: string }> {
    const response = await fetch(`${baseUrl}${path}`, init);
    const body = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { body, response };
  }

  beforeEach(async () => {
    // Pin the baseline sample so ordinary successes are kept.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    events = [];
    const app = express();
    app.use(
      createWideEventMiddleware({
        describeRequest: (req: Request) => ({
          user: { id: req.header('x-test-user') },
        }),
        identity: { service: 'api', version: '1.2.3' },
        redactPath: (path) =>
          path.replace(/\/click\/[^/]+/, '/click/[redacted]'),
        sink: { wideEvent: (event) => events.push(event) },
      }),
    );
    app.get('/v1/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    app.get('/v1/posts/:id', (req, res) => {
      enrichWideEvent({ post: { id: req.params.id } });
      res.json({ ok: true });
    });
    app.get('/v1/click/:token', (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/v1/missing', (_req, res) => {
      res.status(404).json({ error: 'missing' });
    });
    app.get('/v1/boom', (_req, res) => {
      recordWideEventError(new Error('database unavailable'), { status: 500 });
      res.status(500).json({ error: 'boom' });
    });
    app.get('/v1/slow-reader', async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      res.json({ ok: true });
    });

    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  });

  it('emits exactly one event per request, carrying everything learned along the way', async () => {
    const { response } = await request('/v1/posts/p-1?token=secret', {
      headers: { 'user-agent': 'vitest', 'x-test-user': 'u-7' },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      duration_ms: expect.any(Number),
      kind: 'http',
      method: 'GET',
      outcome: 'success',
      path: '/v1/posts/p-1',
      post: { id: 'p-1' },
      route: '/v1/posts/:id',
      sample_rate: expect.any(Number),
      service: 'api',
      status_code: 200,
      user: { id: 'u-7' },
      user_agent: 'vitest',
      version: '1.2.3',
    });
    expect(response.headers.get('x-request-id')).toBe(events[0]?.request_id);
  });

  it('never records query strings, which can carry tokens', async () => {
    await request('/v1/posts/p-1?token=secret');

    expect(JSON.stringify(events[0])).not.toContain('secret');
  });

  it('continues an incoming traceparent and honours a caller request id', async () => {
    await request('/v1/boom', {
      headers: {
        traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`,
        'x-request-id': 'caller-req-9',
      },
    });

    expect(events[0]).toMatchObject({
      parent_span_id: PARENT_SPAN_ID,
      request_id: 'caller-req-9',
      trace_id: TRACE_ID,
    });
  });

  it('records a failure with its status and error', async () => {
    await request('/v1/boom');

    expect(events[0]).toMatchObject({
      error: { message: 'database unavailable', status: 500 },
      outcome: 'error',
      status_code: 500,
    });
  });

  it('marks a 404 as the caller’s mistake', async () => {
    await request('/v1/missing');

    // 404s are thinned to the baseline rate, so this event may be sampled out.
    for (const event of events) {
      expect(event).toMatchObject({
        outcome: 'client_error',
        status_code: 404,
      });
    }
  });

  it('redacts secrets that ride in the path', async () => {
    await request('/v1/click/abc123');

    expect(events[0]?.path).toBe('/v1/click/[redacted]');
  });

  it('skips health probes', async () => {
    await request('/v1/health');

    expect(events).toHaveLength(0);
  });

  it('records a client that hung up before the response as aborted', async () => {
    const controller = new AbortController();
    const pending = fetch(`${baseUrl}/v1/slow-reader`, {
      signal: controller.signal,
    }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      client_aborted: true,
      outcome: 'client_error',
      status_code: 499,
    });
  });
});
