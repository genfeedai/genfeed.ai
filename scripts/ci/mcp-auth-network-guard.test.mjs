import assert from 'node:assert/strict';
import test from 'node:test';
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
