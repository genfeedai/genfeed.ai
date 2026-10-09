import { appendFileSync, lstatSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { dirname, resolve } from 'node:path';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const PORTS = new Set([3010, 3014, 5432, 6379, 3011]);
const NOTIFICATION_PROBES = new Set([
  '/v1/health',
  '/v1/internal/email-deliveries',
  '/v1/internal/system-notifications',
]);
export function destinationVerdict({
  host,
  port,
  path = '/',
  method = 'GET',
  transport,
}) {
  if (!LOOPBACK.has(host)) return 'external-destination';
  if (Number(port) === 3999) return 'provider-submission';
  if (!PORTS.has(Number(port))) return 'unexpected-peer';
  if (
    Number(port) === 3011 &&
    transport !== 'socket' &&
    (!NOTIFICATION_PROBES.has(path) || method !== 'GET')
  )
    return 'notification-submission';
  if (transport === 'https') return 'unexpected-tls';
  return null;
}

export function installNetworkGuard({ report, nonce }) {
  if (
    !/^[0-9a-f]{32}$/.test(nonce ?? '') ||
    !report ||
    !resolve(report).endsWith(`/network-${nonce}.jsonl`)
  )
    throw new Error('NETWORK_GUARD_IDENTITY');
  const dir = lstatSync(dirname(report));
  if (
    !dir.isDirectory() ||
    (dir.mode & 0o777) !== 0o700 ||
    dir.isSymbolicLink()
  )
    throw new Error('NETWORK_GUARD_DIRECTORY');
  const check = (destination) => {
    const category = destinationVerdict(destination);
    if (!category) return;
    // Never record a URL, query, payload, authorization header or credential.
    appendFileSync(
      report,
      `${JSON.stringify({ category, transport: destination.transport })}\n`,
      { mode: 0o600 },
    );
    throw new Error(
      `MCP_RUNTIME_NETWORK_${category.toUpperCase().replaceAll('-', '_')}`,
    );
  };
  const describe = (args, transport) => {
    const first = args[0];
    if (first instanceof URL || typeof first === 'string') {
      const url = first instanceof URL ? first : new URL(first);
      return {
        host: url.hostname,
        port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
        path: url.pathname,
        method: args[1]?.method ?? 'GET',
        transport,
      };
    }
    const options = first ?? {};
    return {
      host: options.hostname ?? options.host ?? 'localhost',
      port: Number(options.port ?? (transport === 'https' ? 443 : 80)),
      path: (options.path ?? '/').split('?')[0],
      method: options.method ?? 'GET',
      transport,
    };
  };
  for (const [module, transport] of [
    [http, 'http'],
    [https, 'https'],
  ]) {
    for (const name of ['request', 'get']) {
      const original = module[name];
      module[name] = function (...args) {
        check(describe(args, transport));
        return original.apply(this, args);
      };
    }
  }
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const input = Array.isArray(args[0]) ? args[0] : args;
    const first = input[0];
    const options =
      typeof first === 'object'
        ? first
        : {
            port: first,
            host: typeof input[1] === 'string' ? input[1] : 'localhost',
          };
    if (options.path)
      check({ host: 'unix-socket', port: 0, transport: 'socket' });
    else
      check({
        host: options.host ?? 'localhost',
        port: Number(options.port),
        transport: 'socket',
      });
    return originalConnect.apply(this, args);
  };
  const originalFetch = globalThis.fetch;
  if (originalFetch)
    globalThis.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      check(
        describe(
          [
            url,
            {
              method:
                init?.method ??
                (typeof input === 'object' && !(input instanceof URL)
                  ? input.method
                  : 'GET'),
            },
          ],
          url.protocol === 'https:' ? 'https' : 'fetch',
        ),
      );
      return originalFetch(input, init);
    };
  syncBuiltinESMExports();
}
if (process.env.MCP_AUTH_NETWORK_REPORT || process.env.MCP_AUTH_RUNTIME_NONCE)
  installNetworkGuard({
    report: process.env.MCP_AUTH_NETWORK_REPORT,
    nonce: process.env.MCP_AUTH_RUNTIME_NONCE,
  });
