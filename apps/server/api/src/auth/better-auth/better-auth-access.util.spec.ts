import { isPlatformSuperAdmin } from '@api/auth/better-auth/better-auth-access.util';
import { PlatformRole } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('isPlatformSuperAdmin', () => {
  it('accepts the SUPERADMIN role case-insensitively', () => {
    expect(isPlatformSuperAdmin(PlatformRole.SUPERADMIN)).toBe(true);
    expect(isPlatformSuperAdmin('superadmin')).toBe(true);
    expect(isPlatformSuperAdmin('ADMIN')).toBe(false);
    expect(isPlatformSuperAdmin(null)).toBe(false);
  });
});
