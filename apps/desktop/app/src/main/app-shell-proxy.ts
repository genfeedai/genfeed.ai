import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import https from 'node:https';
import net from 'node:net';

/**
 * The bundled Next.js shell bakes its `/v1` rewrite target at build time.
 * Desktop fronts it with this loopback proxy so `/v1/*` follows the server
 * selected at launch (Genfeed Cloud or self-hosted) while every other path
 * is served by the bundled Next server.
 */
export interface DesktopShellProxyTargets {
  apiEndpoint: string;
  nextOrigin: string;
}

const API_PATH_PREFIX = '/v1';
const PLACEHOLDER_ORIGIN = 'http://desktop-shell.invalid';

function isApiPath(pathname: string): boolean {
  return (
    pathname === API_PATH_PREFIX || pathname.startsWith(`${API_PATH_PREFIX}/`)
  );
}

export function resolveDesktopShellProxyTarget(
  requestUrl: string,
  targets: DesktopShellProxyTargets,
): { isApi: boolean; url: URL } {
  const incoming = new URL(requestUrl, PLACEHOLDER_ORIGIN);

  if (incoming.origin !== PLACEHOLDER_ORIGIN) {
    throw new Error('Desktop shell proxy only accepts origin-relative paths.');
  }

  if (isApiPath(incoming.pathname)) {
    const api = new URL(targets.apiEndpoint);
    const basePath = api.pathname.replace(/\/+$/, '');
    const suffix = incoming.pathname.slice(API_PATH_PREFIX.length);

    return {
      isApi: true,
      url: new URL(`${api.origin}${basePath}${suffix}${incoming.search}`),
    };
  }

  return {
    isApi: false,
    url: new URL(`${incoming.pathname}${incoming.search}`, targets.nextOrigin),
  };
}

function buildUpstreamHeaders(
  headers: IncomingHttpHeaders,
  target: URL,
  isApi: boolean,
): IncomingHttpHeaders {
  if (!isApi) {
    return headers;
  }

  return {
    ...headers,
    host: target.host,
    'x-forwarded-host': headers.host,
    'x-forwarded-proto': 'http',
  };
}

export function createDesktopShellProxyServer(
  targets: DesktopShellProxyTargets,
  onError: (message: string) => void,
): http.Server {
  return http.createServer((req: IncomingMessage, res: ServerResponse) => {
    let resolved: { isApi: boolean; url: URL };

    try {
      resolved = resolveDesktopShellProxyTarget(req.url ?? '/', targets);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }

    const transport = resolved.url.protocol === 'https:' ? https : http;
    const upstream = transport.request(
      resolved.url,
      {
        headers: buildUpstreamHeaders(
          req.headers,
          resolved.url,
          resolved.isApi,
        ),
        method: req.method,
      },
      (upstreamResponse) => {
        res.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(res);
      },
    );

    upstream.on('error', (error) => {
      onError(
        `[desktop-app] shell proxy could not reach ${resolved.url.origin}: ${error.message}\n`,
      );
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end('Genfeed Desktop could not reach the server.');
    });

    res.on('close', () => {
      if (!res.writableFinished) {
        upstream.destroy();
      }
    });

    req.pipe(upstream);
  });
}

/** Asks the OS for a free loopback port for the internal Next server. */
export async function findFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => {
        if (port > 0) {
          resolve(port);
        } else {
          reject(new Error('Could not allocate a loopback port.'));
        }
      });
    });
  });
}
