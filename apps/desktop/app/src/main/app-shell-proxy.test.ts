import { afterEach, describe, expect, it } from 'bun:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createDesktopShellProxyServer,
  resolveDesktopShellProxyTarget,
} from './app-shell-proxy';

const servers: http.Server[] = [];

async function listen(server: http.Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

describe('resolveDesktopShellProxyTarget', () => {
  const targets = {
    apiEndpoint: 'https://api.acme.dev/v1',
    nextOrigin: 'http://127.0.0.1:51234',
  };

  it('sends /v1 to the selected API and everything else to Next', () => {
    expect(
      resolveDesktopShellProxyTarget('/v1/agent/threads?x=1', targets),
    ).toEqual({
      isApi: true,
      url: new URL('https://api.acme.dev/v1/agent/threads?x=1'),
    });
    expect(resolveDesktopShellProxyTarget('/v1', targets).url.href).toBe(
      'https://api.acme.dev/v1',
    );
    expect(resolveDesktopShellProxyTarget('/v10/x', targets)).toEqual({
      isApi: false,
      url: new URL('http://127.0.0.1:51234/v10/x'),
    });
    expect(resolveDesktopShellProxyTarget('/studio', targets).isApi).toBe(
      false,
    );
  });

  it('keeps a self-hosted API base path', () => {
    expect(
      resolveDesktopShellProxyTarget('/v1/health', {
        ...targets,
        apiEndpoint: 'https://acme.dev/api/v1',
      }).url.href,
    ).toBe('https://acme.dev/api/v1/health');
  });

  it('rejects absolute-form request targets', () => {
    expect(() =>
      resolveDesktopShellProxyTarget('http://evil.example/v1/x', targets),
    ).toThrow();
  });
});

describe('createDesktopShellProxyServer', () => {
  it('forwards API and app requests to their upstreams', async () => {
    const apiRequests: Array<{ host?: string; url?: string }> = [];
    const apiOrigin = await listen(
      http.createServer((req, res) => {
        apiRequests.push({ host: req.headers.host, url: req.url });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"status":"ok"}');
      }),
    );
    const nextOrigin = await listen(
      http.createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>shell</html>');
      }),
    );
    const proxyOrigin = await listen(
      createDesktopShellProxyServer(
        { apiEndpoint: `${apiOrigin}/v1`, nextOrigin },
        () => {},
      ),
    );

    const apiResponse = await fetch(`${proxyOrigin}/v1/health?deep=1`);
    expect(await apiResponse.json()).toEqual({ status: 'ok' });
    expect(apiRequests).toEqual([
      { host: new URL(apiOrigin).host, url: '/v1/health?deep=1' },
    ]);

    const appResponse = await fetch(`${proxyOrigin}/login`);
    expect(await appResponse.text()).toBe('<html>shell</html>');
  });

  it('answers 502 when the selected server is unreachable', async () => {
    const errors: string[] = [];
    const proxyOrigin = await listen(
      createDesktopShellProxyServer(
        {
          apiEndpoint: 'http://127.0.0.1:1/v1',
          nextOrigin: 'http://127.0.0.1:1',
        },
        (message) => errors.push(message),
      ),
    );

    const response = await fetch(`${proxyOrigin}/v1/health`);
    expect(response.status).toBe(502);
    expect(errors.length).toBe(1);
  });
});
