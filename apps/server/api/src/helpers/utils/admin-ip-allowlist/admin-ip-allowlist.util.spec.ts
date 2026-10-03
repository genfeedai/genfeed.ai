import {
  getAdminAllowedIps,
  isAdminIpAllowed,
  resolveAdminClientIp,
} from '@api/helpers/utils/admin-ip-allowlist/admin-ip-allowlist.util';
import { resolveTrustProxyFromReader } from '@genfeedai/config/deployment';
import express, { type Request, type Response } from 'express';
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

describe('admin IP allowlist behind the deployment trust-proxy setting', () => {
  const ALLOWLISTED_IP = '203.0.113.7';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Mirrors main.ts: the trust-proxy value comes from the deployment env.
  function buildApp(env: Record<string, string | undefined>) {
    const app = express();
    app.set(
      'trust proxy',
      resolveTrustProxyFromReader((key) => env[key]),
    );
    app.get('/', (req: Request, res: Response) => {
      res.json({
        ip: resolveAdminClientIp(req),
        isAllowed: isAdminIpAllowed(req),
      });
    });
    return app;
  }

  it('ignores a spoofed X-Forwarded-For from a direct client on self-host', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWLISTED_IP);

    const response = await request(buildApp({ GENFEED_CLOUD: 'false' }))
      .get('/')
      .set('X-Forwarded-For', ALLOWLISTED_IP);

    expect(response.body.ip).not.toBe(ALLOWLISTED_IP);
    expect(response.body.isAllowed).toBe(false);
  });

  it('ignores X-Forwarded-For when the peer is not a proxy TRUST_PROXY names', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWLISTED_IP);

    const response = await request(
      buildApp({ GENFEED_CLOUD: 'false', TRUST_PROXY: '10.0.0.0/8' }),
    )
      .get('/')
      .set('X-Forwarded-For', ALLOWLISTED_IP);

    expect(response.body.isAllowed).toBe(false);
  });

  it('honours X-Forwarded-For from a proxy TRUST_PROXY names on self-host', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWLISTED_IP);

    const response = await request(
      buildApp({ GENFEED_CLOUD: 'false', TRUST_PROXY: 'loopback' }),
    )
      .get('/')
      .set('X-Forwarded-For', ALLOWLISTED_IP);

    expect(response.body).toEqual({ ip: ALLOWLISTED_IP, isAllowed: true });
  });

  it('takes the load balancer hop on Cloud, not a client-prepended entry', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWLISTED_IP);

    const response = await request(buildApp({ GENFEED_CLOUD: 'true' }))
      .get('/')
      .set('X-Forwarded-For', `${ALLOWLISTED_IP}, 198.51.100.9`);

    expect(response.body).toEqual({ ip: '198.51.100.9', isAllowed: false });
  });
});
