import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  configureLoadBalancerKeepAlive,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  LOAD_BALANCER_IDLE_TIMEOUT_MS,
} from './http-keep-alive';

describe('configureLoadBalancerKeepAlive', () => {
  it('holds an idle connection longer than the load balancer does', () => {
    const server = createServer();

    configureLoadBalancerKeepAlive(server);

    expect(server.keepAliveTimeout).toBe(65_000);
    expect(server.headersTimeout).toBe(66_000);
    expect(server.keepAliveTimeout).toBeGreaterThan(
      LOAD_BALANCER_IDLE_TIMEOUT_MS,
    );
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
    expect(KEEP_ALIVE_TIMEOUT_MS).toBe(server.keepAliveTimeout);
    expect(HEADERS_TIMEOUT_MS).toBe(server.headersTimeout);
  });

  it('keeps the setting once the server is listening', async () => {
    const server = createServer((_request, response) => response.end('ok'));
    configureLoadBalancerKeepAlive(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/`);

      expect(await response.text()).toBe('ok');
      expect(server.keepAliveTimeout).toBe(65_000);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
