import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLocalMailStub } from './cloud-tenant-guard-sweep/local-mail-stub.mjs';
import {
  destinationVerdict,
  installNetworkGuard,
} from './mcp-auth-network-guard.mjs';

test('the passive guard permits only the finite owned loopback destinations', () => {
  for (const port of [3010, 3014, 5432, 6379])
    assert.equal(
      destinationVerdict({ host: '127.0.0.1', port, transport: 'socket' }),
      null,
    );
  assert.equal(
    destinationVerdict({
      host: '127.0.0.1',
      port: 3011,
      path: '/v1/health',
      transport: 'http',
    }),
    null,
  );
  for (const host of [
    'api.openai.com',
    '169.254.169.254',
    '10.0.0.1',
    'example.invalid',
  ])
    assert.equal(
      destinationVerdict({ host, port: 443, transport: 'https' }),
      'external-destination',
    );
  assert.equal(
    destinationVerdict({ host: '127.0.0.1', port: 3999, transport: 'fetch' }),
    'provider-submission',
  );
  assert.equal(
    destinationVerdict({
      host: 'localhost',
      port: 3011,
      path: '/v1/email/send',
      transport: 'http',
    }),
    'notification-submission',
  );
  assert.equal(
    destinationVerdict({ host: 'localhost', port: 3012, transport: 'socket' }),
    'unexpected-peer',
  );
});
test('guard installation rejects missing owned identity before patching globals', () => {
  for (const args of [
    {},
    { report: '/tmp/network-other.jsonl', nonce: 'a'.repeat(32) },
  ])
    assert.throws(() => installNetworkGuard(args), /NETWORK_GUARD_IDENTITY/);
});

test('a health path cannot disguise a notification write', () => {
  assert.equal(
    destinationVerdict({
      host: '127.0.0.1',
      port: 3011,
      path: '/v1/health',
      method: 'POST',
      transport: 'fetch',
    }),
    'notification-submission',
  );
});

test('only the three approved readonly notification probes pass the passive fence', () => {
  for (const path of [
    '/v1/health',
    '/v1/internal/email-deliveries',
    '/v1/internal/system-notifications',
  ]) {
    assert.equal(
      destinationVerdict({
        host: '127.0.0.1',
        port: 3011,
        path,
        method: 'GET',
        transport: 'http',
      }),
      null,
    );
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
      assert.equal(
        destinationVerdict({
          host: '127.0.0.1',
          port: 3011,
          path,
          method,
          transport: 'fetch',
        }),
        'notification-submission',
      );
  }
  for (const path of [
    '/v1/internal/channel-deliveries',
    '/v1/email/send',
    '/v1/internal/email-deliveries/other',
  ])
    assert.equal(
      destinationVerdict({
        host: '127.0.0.1',
        port: 3011,
        path,
        method: 'GET',
        transport: 'http',
      }),
      'notification-submission',
    );
});

test('the unchanged notification stub authenticates internal probes and retains unavailable delivery', async () => {
  const runDir = mkdtempSync(join(tmpdir(), 'mcp-auth-probe-'));
  const key = 'ci-placeholder-internal-service-api-key';
  const stub = createLocalMailStub({ mode: 'ci', key, runDir });
  const server = stub.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    for (const path of [
      '/v1/internal/email-deliveries',
      '/v1/internal/system-notifications',
    ]) {
      for (const authorization of [undefined, 'Bearer invalid-fixture-key']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: authorization ? { authorization } : {},
        });
        assert.equal(response.status, 401);
        await response.arrayBuffer();
      }
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { authorization: `Bearer ${key}` },
      });
      assert.equal(
        response.status,
        path.endsWith('email-deliveries') ? 200 : 503,
      );
      if (response.status === 200)
        assert.deepEqual(await response.json(), { isConfigured: true });
      else await response.arrayBuffer();
    }
    const stats = JSON.parse(
      readFileSync(join(runDir, 'mail-stats.json'), 'utf8'),
    );
    assert.ok(Object.values(stats.accepted).every((count) => count === 0));
    assert.equal(stats.rejected.authorization, 4);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(runDir, { recursive: true, force: true });
  }
});
