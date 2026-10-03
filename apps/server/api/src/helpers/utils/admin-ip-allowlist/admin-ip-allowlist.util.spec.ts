import {
  getAdminAllowedIps,
  isAdminIpAllowed,
  resolveAdminClientIp,
} from '@api/helpers/utils/admin-ip-allowlist/admin-ip-allowlist.util';
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

describe('admin IP allowlist for callers that declare the client unknown', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createApi(trustProxy: boolean | string[]) {
    const app = express();
    app.set('trust proxy', trustProxy);
    app.get('/v1/admin-probe', (req: Request, res: Response) => {
      res.json({
        ip: resolveAdminClientIp(req),
        isAllowed: isAdminIpAllowed(req),
      });
    });
    return app;
  }

  it.each([
    'for=unknown',
    'For="unknown"',
    'for=192.0.2.60;proto=http, for=unknown',
  ])('treats `Forwarded: %s` as an unknown client', (forwarded) => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '127.0.0.1');

    expect(
      resolveAdminClientIp({ headers: { forwarded }, ip: '127.0.0.1' }),
    ).toBe('');
  });

  it('denies a loopback app-server call that declares the client unknown', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '127.0.0.1,::1');

    const response = await request(createApi(false))
      .get('/v1/admin-probe')
      .set('Forwarded', 'for=unknown');

    expect(response.body).toEqual({ ip: '', isAllowed: false });
  });

  it('denies it behind a trusted loopback proxy that names the app server', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '127.0.0.1,::1');

    const response = await request(createApi(['loopback']))
      .get('/v1/admin-probe')
      .set('Forwarded', 'for=unknown')
      .set('X-Forwarded-For', '127.0.0.1');

    expect(response.body).toEqual({ ip: '', isAllowed: false });
  });

  it('still allows a direct loopback client that names no forwarding', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '127.0.0.1,::1');

    const response = await request(createApi(false)).get('/v1/admin-probe');

    expect(response.body.isAllowed).toBe(true);
  });

  it('ignores Forwarded elements that do not declare the client unknown', () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '10.0.0.1');

    expect(
      isAdminIpAllowed({
        headers: { forwarded: 'for=_gateway;by=unknown' },
        ip: '10.0.0.1',
      }),
    ).toBe(true);
  });
});
