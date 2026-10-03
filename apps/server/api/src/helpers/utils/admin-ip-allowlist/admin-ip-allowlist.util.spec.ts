import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parse } from 'node:url';
import {
  getAdminAllowedIps,
  isAdminIpAllowed,
  resolveAdminClientIp,
} from '@api/helpers/utils/admin-ip-allowlist/admin-ip-allowlist.util';
import express, { type Request, type Response } from 'express';
import { proxyRequest } from 'next/dist/server/lib/router-utils/proxy-request';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('admin IP allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses and normalizes ADMIN_ALLOWED_IPS', () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ' 10.0.0.1 ,::ffff:203.0.113.7,, ');

    expect(getAdminAllowedIps()).toEqual(['10.0.0.1', '203.0.113.7']);
  });

  it('prefers request.ip and falls back to the socket address', () => {
    expect(resolveAdminClientIp({ ip: '::ffff:10.0.0.1' })).toBe('10.0.0.1');
    expect(
      resolveAdminClientIp({ socket: { remoteAddress: '10.0.0.2' } }),
    ).toBe('10.0.0.2');
    expect(resolveAdminClientIp({})).toBe('');
  });

  it('allows only listed IPs', () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '10.0.0.1');

    expect(isAdminIpAllowed({ ip: '10.0.0.1' })).toBe(true);
    expect(isAdminIpAllowed({ ip: '10.0.0.9' })).toBe(false);
  });

  it('blocks everyone when the list is empty and requests without an IP', () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '');
    expect(isAdminIpAllowed({ ip: '127.0.0.1' })).toBe(false);

    vi.stubEnv('ADMIN_ALLOWED_IPS', '127.0.0.1');
    expect(isAdminIpAllowed({})).toBe(false);
  });
});

describe('admin IP allowlist through the app /v1 rewrite', () => {
  const ALLOWED_IPS = '127.0.0.1,::1,203.0.113.7';
  const servers: Server[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
  });

  async function listen(server: Server): Promise<number> {
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    return (server.address() as AddressInfo).port;
  }

  async function startApi(trustProxy: boolean | number | string[]) {
    const app = express();
    app.set('trust proxy', trustProxy);
    app.get('/v1/admin-probe', (req: Request, res: Response) => {
      res.json({
        ip: resolveAdminClientIp(req),
        isAllowed: isAdminIpAllowed(req),
      });
    });
    return listen(createServer(app));
  }

  /**
   * The app's `/v1/:path*` external rewrite, run through Next's own proxy:
   * the API sees a loopback peer and whatever headers the client sent.
   */
  async function startAppRewrite(apiPort: number) {
    return listen(
      createServer((req, res) => {
        void proxyRequest(
          req,
          res,
          parse(`http://127.0.0.1:${apiPort}${req.url}`, true),
        );
      }),
    );
  }

  /** A forwarder that appends its peer, as Portless or nginx do. */
  async function startAttributingProxy(apiPort: number) {
    return listen(
      createServer((req, res) => {
        const forwardedFor = req.headers['x-forwarded-for'];
        const peer = req.socket.remoteAddress ?? '';
        const upstream = httpRequest(
          {
            headers: {
              ...req.headers,
              'x-forwarded-for': forwardedFor
                ? `${forwardedFor}, ${peer}`
                : peer,
              'x-forwarded-host': req.headers.host,
            },
            host: '127.0.0.1',
            method: req.method,
            path: req.url,
            port: apiPort,
          },
          (upstreamRes) => {
            res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
            upstreamRes.pipe(res);
          },
        );
        req.pipe(upstream);
      }),
    );
  }

  it.each([
    ['self-host default (no trust)', false],
    ['one trusted hop', 1],
  ])(
    'denies a remote request through the rewrite under %s',
    async (_label, trustProxy) => {
      vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWED_IPS);
      const appPort = await startAppRewrite(await startApi(trustProxy));

      const response = await request(`http://127.0.0.1:${appPort}`).get(
        '/v1/admin-probe',
      );

      expect(response.body).toEqual({ ip: '', isAllowed: false });
    },
  );

  it('denies a forged loopback X-Forwarded-For through the rewrite', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWED_IPS);
    const appPort = await startAppRewrite(await startApi(false));

    const response = await request(`http://127.0.0.1:${appPort}`)
      .get('/v1/admin-probe')
      .set('X-Forwarded-For', '127.0.0.1');

    expect(response.body).toEqual({ ip: '', isAllowed: false });
  });

  // Node caps incoming headers at 1000. Filler headers must not push the
  // rewrite's x-forwarded-host past the cap and strip the marker; the counts
  // straddle the cap once the client's and proxy's own headers are added.
  it.each(Array.from({ length: 10 }, (_, index) => 990 + index))(
    'denies a rewrite request padded with %i filler headers',
    async (count) => {
      vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWED_IPS);
      const appPort = await startAppRewrite(await startApi(false));
      const filler = Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`x-f${index}`, '1']),
      );

      const response = await request(`http://127.0.0.1:${appPort}`)
        .get('/v1/admin-probe')
        .set(filler);

      expect(response.body.isAllowed).not.toBe(true);
    },
  );

  it('still allows a direct loopback client on the API port', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWED_IPS);
    const apiPort = await startApi(false);

    const response = await request(`http://127.0.0.1:${apiPort}`).get(
      '/v1/admin-probe',
    );

    expect(response.body).toEqual({ ip: '127.0.0.1', isAllowed: true });
  });

  it('honours a loopback proxy the deployment trusts to name the client', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWED_IPS);
    const proxyPort = await startAttributingProxy(await startApi(['loopback']));

    const response = await request(`http://127.0.0.1:${proxyPort}`).get(
      '/v1/admin-probe',
    );

    expect(response.body).toEqual({ ip: '127.0.0.1', isAllowed: true });
  });

  it('denies a loopback proxy the deployment does not trust', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWED_IPS);
    const proxyPort = await startAttributingProxy(await startApi(false));

    const response = await request(`http://127.0.0.1:${proxyPort}`).get(
      '/v1/admin-probe',
    );

    expect(response.body).toEqual({ ip: '', isAllowed: false });
  });
});
