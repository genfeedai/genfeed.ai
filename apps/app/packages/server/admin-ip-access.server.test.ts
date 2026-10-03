import { PlatformRole } from '@genfeedai/contracts';
import type { AccessBootstrapState } from '@services/auth/auth.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveServerSuperAdmin } from './admin-ip-access.server';

const headersMock = vi.hoisted(() => ({ value: new Headers() }));
const deploymentMock = vi.hoisted(() => ({
  isBetterAuthEnabled: true,
  isSelfHosted: false,
}));

vi.mock('next/headers', () => ({
  headers: async () => headersMock.value,
}));

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => deploymentMock.isBetterAuthEnabled,
}));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config/deployment')>()),
  isSelfHostedDeployment: () => deploymentMock.isSelfHosted,
}));

const access = { isSuperAdmin: false } as AccessBootstrapState;
const superAdminUser = { platformRole: PlatformRole.SUPERADMIN } as never;

describe('resolveServerSuperAdmin', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    headersMock.value = new Headers();
    deploymentMock.isBetterAuthEnabled = true;
    deploymentMock.isSelfHosted = false;
  });

  it('grants a super-admin role from an allowlisted visitor IP even when the API saw the server IP', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '203.0.113.7');
    headersMock.value = new Headers({
      'x-forwarded-for': '203.0.113.7, 76.76.21.21',
    });

    await expect(resolveServerSuperAdmin(access, superAdminUser)).resolves.toBe(
      true,
    );
  });

  it('falls back to x-real-ip', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '203.0.113.7');
    headersMock.value = new Headers({ 'x-real-ip': '203.0.113.7' });

    await expect(resolveServerSuperAdmin(access, superAdminUser)).resolves.toBe(
      true,
    );
  });

  it('denies a super-admin role from any other IP', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '203.0.113.7');
    headersMock.value = new Headers({ 'x-forwarded-for': '198.51.100.9' });

    await expect(
      resolveServerSuperAdmin(
        { ...access, isSuperAdmin: true },
        superAdminUser,
      ),
    ).resolves.toBe(false);
  });

  it('denies everyone when ADMIN_ALLOWED_IPS is empty', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '');
    headersMock.value = new Headers({ 'x-forwarded-for': '203.0.113.7' });

    await expect(resolveServerSuperAdmin(access, superAdminUser)).resolves.toBe(
      false,
    );
  });

  it('denies a regular user on an allowlisted IP', async () => {
    vi.stubEnv('ADMIN_ALLOWED_IPS', '203.0.113.7');
    headersMock.value = new Headers({ 'x-forwarded-for': '203.0.113.7' });

    await expect(
      resolveServerSuperAdmin(access, { platformRole: 'USER' } as never),
    ).resolves.toBe(false);
  });

  describe('LOCAL mode (self-hosted, Better Auth off)', () => {
    const localUser = { platformRole: 'USER' } as never;

    // Self-host is not on Vercel; the visitor IP comes from a proxy
    // TRUST_PROXY names.
    beforeEach(() => {
      vi.stubEnv('VERCEL', '');
      vi.stubEnv('TRUST_PROXY', 'loopback');
    });

    it('grants the local admin from an allowlisted visitor IP although the API withheld it', async () => {
      deploymentMock.isSelfHosted = true;
      deploymentMock.isBetterAuthEnabled = false;
      vi.stubEnv('ADMIN_ALLOWED_IPS', '192.168.1.20');
      headersMock.value = new Headers({ 'x-forwarded-for': '192.168.1.20' });

      await expect(resolveServerSuperAdmin(access, localUser)).resolves.toBe(
        true,
      );
    });

    it('denies the local admin from any other visitor IP', async () => {
      deploymentMock.isSelfHosted = true;
      deploymentMock.isBetterAuthEnabled = false;
      vi.stubEnv('ADMIN_ALLOWED_IPS', '127.0.0.1');
      headersMock.value = new Headers({ 'x-forwarded-for': '198.51.100.9' });

      await expect(resolveServerSuperAdmin(access, localUser)).resolves.toBe(
        false,
      );
    });

    it('keeps requiring the role when self-host runs Better Auth', async () => {
      deploymentMock.isSelfHosted = true;
      vi.stubEnv('ADMIN_ALLOWED_IPS', '192.168.1.20');
      headersMock.value = new Headers({ 'x-forwarded-for': '192.168.1.20' });

      await expect(resolveServerSuperAdmin(access, localUser)).resolves.toBe(
        false,
      );
    });
  });
});

describe('resolveServerSuperAdmin outside Vercel', () => {
  const ALLOWLISTED_IP = '203.0.113.7';

  beforeEach(() => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUST_PROXY', '');
    vi.stubEnv('ADMIN_ALLOWED_IPS', ALLOWLISTED_IP);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    headersMock.value = new Headers();
  });

  async function isSuperAdminWith(requestHeaders: Record<string, string>) {
    headersMock.value = new Headers(requestHeaders);
    return resolveServerSuperAdmin(access, superAdminUser);
  }

  it('ignores a spoofed x-forwarded-for from a direct client by default', async () => {
    await expect(
      isSuperAdminWith({ 'x-forwarded-for': ALLOWLISTED_IP }),
    ).resolves.toBe(false);
  });

  it('ignores a client-supplied x-real-ip', async () => {
    vi.stubEnv('TRUST_PROXY', '1');

    await expect(
      isSuperAdminWith({ 'x-real-ip': ALLOWLISTED_IP }),
    ).resolves.toBe(false);
  });

  it('takes the entry the trusted hop appended, not a client-prepended one', async () => {
    vi.stubEnv('TRUST_PROXY', '1');

    await expect(
      isSuperAdminWith({
        'x-forwarded-for': `${ALLOWLISTED_IP}, 198.51.100.9`,
      }),
    ).resolves.toBe(false);
    await expect(
      isSuperAdminWith({
        'x-forwarded-for': `198.51.100.9, ${ALLOWLISTED_IP}`,
      }),
    ).resolves.toBe(true);
  });

  it('skips the proxies TRUST_PROXY names and stops at the first other hop', async () => {
    vi.stubEnv('TRUST_PROXY', 'loopback, 10.0.0.0/8');

    await expect(
      isSuperAdminWith({
        'x-forwarded-for': `${ALLOWLISTED_IP}, 10.0.0.5, 127.0.0.1`,
      }),
    ).resolves.toBe(true);
    await expect(
      isSuperAdminWith({
        'x-forwarded-for': `${ALLOWLISTED_IP}, 198.51.100.9, 10.0.0.5`,
      }),
    ).resolves.toBe(false);
  });

  it('trusts the leftmost entry only when TRUST_PROXY is true', async () => {
    vi.stubEnv('TRUST_PROXY', 'true');

    await expect(
      isSuperAdminWith({
        'x-forwarded-for': `${ALLOWLISTED_IP}, 198.51.100.9`,
      }),
    ).resolves.toBe(true);
  });
});
