import {
  getAdminAllowedIps,
  isAdminIpAllowed,
  resolveAdminClientIp,
} from '@api/helpers/utils/admin-ip-allowlist/admin-ip-allowlist.util';
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
