import { PlatformRole } from '@genfeedai/contracts';

export function isPlatformSuperAdmin(platformRole: unknown): boolean {
  return (
    typeof platformRole === 'string' &&
    platformRole.toUpperCase() === PlatformRole.SUPERADMIN
  );
}
