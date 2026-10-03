import { PlatformRole } from '@genfeedai/contracts';
import type { AccessBootstrapState } from '@services/auth/auth.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveServerSuperAdmin } from './admin-ip-access.server';

const headersMock = vi.hoisted(() => ({ value: new Headers() }));

vi.mock('next/headers', () => ({
  headers: async () => headersMock.value,
}));

const access = { isSuperAdmin: false } as AccessBootstrapState;
const superAdminUser = { platformRole: PlatformRole.SUPERADMIN } as never;

describe('resolveServerSuperAdmin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    headersMock.value = new Headers();
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
});
