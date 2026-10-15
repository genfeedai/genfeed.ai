import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parse } from 'node:url';
import { isLocalIdentityPeer } from '@api/helpers/utils/local-identity/local-identity-peer.util';
import { resolveTrustProxyFromReader } from '@genfeedai/config/deployment';
import express, { type Request, type Response } from 'express';
import { proxyRequest } from 'next/dist/server/lib/router-utils/proxy-request';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

describe('isLocalIdentityPeer', () => {
  it.each([
    '127.0.0.1',
    '127.8.9.10',
    '::1',
    '::ffff:127.0.0.1',
    '172.16.0.2',
    '172.18.0.5',
    '::ffff:172.31.255.254',
  ])('accepts %s as this machine or the Docker network', (ip) => {
    expect(isLocalIdentityPeer({ ip })).toBe(true);
  });

  it.each([
    '198.51.100.9',
    '203.0.113.7',
    '172.15.255.255',
    '172.32.0.1',
    '192.168.1.20',
    '10.0.0.4',
    '2001:db8::1',
    'not-an-address',
    '',
  ])('rejects %s', (ip) => {
    expect(isLocalIdentityPeer({ ip })).toBe(false);
  });

  it('rejects a request with no address at all', () => {
    expect(isLocalIdentityPeer({})).toBe(false);
  });

  it('falls back to the socket address when Express set no client ip', () => {
    expect(isLocalIdentityPeer({ socket: { remoteAddress: '::1' } })).toBe(
      true,
    );
    expect(
      isLocalIdentityPeer({ socket: { remoteAddress: '198.51.100.9' } }),
    ).toBe(false);
  });

  it.each([
    ['x-forwarded-for', '198.51.100.9'],
    ['x-forwarded-for', '127.0.0.1'],
    ['x-real-ip', '198.51.100.9'],
    ['forwarded', 'for=198.51.100.9;proto=https'],
    ['forwarded', 'for="[2001:db8::1]"'],
  ])(
    'refuses a loopback peer that carries an untrusted %s: %s',
    (header, value) => {
      expect(
        isLocalIdentityPeer({
          headers: { [header]: value },
          ip: '127.0.0.1',
          ips: [],
          socket: { remoteAddress: '127.0.0.1' },
        }),
      ).toBe(false);
    },
  );

  it('refuses a Docker gateway peer that carries an untrusted X-Forwarded-For', () => {
    expect(
      isLocalIdentityPeer({
        headers: { 'x-forwarded-for': '198.51.100.9' },
        ip: '172.18.0.1',
        ips: [],
      }),
    ).toBe(false);
  });

  it.each(['for=unknown', 'For="unknown"', 'for=unknown;proto=http'])(
    'treats `Forwarded: %s` from an internal service as a local call',
    (forwarded) => {
      expect(
        isLocalIdentityPeer({
          headers: { forwarded },
          ip: '127.0.0.1',
          ips: [],
        }),
      ).toBe(true);
    },
  );

  it('judges a trusted proxy hop on the client address it reports', () => {
    expect(
      isLocalIdentityPeer({
        headers: { 'x-forwarded-for': '198.51.100.9' },
        ip: '198.51.100.9',
        ips: ['198.51.100.9'],
        socket: { remoteAddress: '127.0.0.1' },
      }),
    ).toBe(false);
    expect(
      isLocalIdentityPeer({
        headers: { 'x-forwarded-for': '172.18.0.9' },
        ip: '172.18.0.9',
        ips: ['172.18.0.9'],
        socket: { remoteAddress: '127.0.0.1' },
      }),
    ).toBe(true);
  });
});

describe('isLocalIdentityPeer behind the deployment trust-proxy setting', () => {
  // Mirrors main.ts: the trust-proxy value comes from the deployment env.
  function buildApp(env: Record<string, string | undefined>) {
    const app = express();
    app.set(
      'trust proxy',
      resolveTrustProxyFromReader((key) => env[key]),
    );
    app.get('/', (req: Request, res: Response) => {
      res.json({ isLocal: isLocalIdentityPeer(req) });
    });
    return app;
  }

  it('accepts a direct loopback call on self-host', async () => {
    const response = await request(buildApp({ GENFEED_CLOUD: 'false' })).get(
      '/',
    );

    expect(response.body).toEqual({ isLocal: true });
  });

  it('does not let a client claim a loopback address through X-Forwarded-For', async () => {
    const response = await request(buildApp({ GENFEED_CLOUD: 'false' }))
      .get('/')
      .set('X-Forwarded-For', '127.0.0.1');

    expect(response.body).toEqual({ isLocal: false });
  });

  it('ignores X-Forwarded-For when the peer is not a proxy TRUST_PROXY names', async () => {
    const response = await request(
      buildApp({ GENFEED_CLOUD: 'false', TRUST_PROXY: '10.0.0.0/8' }),
    )
      .get('/')
      .set('X-Forwarded-For', '172.18.0.9');

    expect(response.body).toEqual({ isLocal: false });
  });

  it('refuses a remote client reported by a proxy TRUST_PROXY names', async () => {
    const response = await request(
      buildApp({ GENFEED_CLOUD: 'false', TRUST_PROXY: 'loopback' }),
    )
      .get('/')
      .set('X-Forwarded-For', '198.51.100.9');

    expect(response.body).toEqual({ isLocal: false });
  });

  it('accepts an internal client reported by a proxy TRUST_PROXY names', async () => {
    const response = await request(
      buildApp({ GENFEED_CLOUD: 'false', TRUST_PROXY: 'loopback' }),
    )
      .get('/')
      .set('X-Forwarded-For', '172.18.0.9');

    expect(response.body).toEqual({ isLocal: true });
  });

  it('accepts an app-server call that declares the client unknown', async () => {
    const response = await request(buildApp({ GENFEED_CLOUD: 'false' }))
      .get('/')
      .set('Forwarded', 'for=unknown');

    expect(response.body).toEqual({ isLocal: true });
  });
});

describe('isLocalIdentityPeer through the app /v1 rewrite', () => {
  const servers: Server[] = [];

  afterEach(async () => {
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

  async function startApi() {
    const app = express();
    app.set('trust proxy', false);
    app.get('/v1/probe', (req: Request, res: Response) => {
      res.json({ isLocal: isLocalIdentityPeer(req) });
    });
    return listen(createServer(app));
  }

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

  it('keeps the web app working: its loopback rewrite reaches the API as local', async () => {
    const appPort = await startAppRewrite(await startApi());

    const response = await request(`http://127.0.0.1:${appPort}`).get(
      '/v1/probe',
    );

    expect(response.body).toEqual({ isLocal: true });
  });

  it('refuses a forged X-Forwarded-For sent through the rewrite', async () => {
    const appPort = await startAppRewrite(await startApi());

    const response = await request(`http://127.0.0.1:${appPort}`)
      .get('/v1/probe')
      .set('X-Forwarded-For', '198.51.100.9');

    expect(response.body).toEqual({ isLocal: false });
  });
});
