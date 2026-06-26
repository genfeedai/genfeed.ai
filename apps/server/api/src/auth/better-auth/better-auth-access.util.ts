import { PlatformRole } from '@genfeedai/enums';

export function isPlatformSuperAdmin(platformRole: unknown): boolean {
  return (
    typeof platformRole === 'string' &&
    platformRole.toUpperCase() === PlatformRole.SUPERADMIN
  );
}
