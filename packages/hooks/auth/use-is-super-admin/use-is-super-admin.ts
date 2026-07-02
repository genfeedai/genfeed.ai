import {
  getAuthPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/auth.helper';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useMemo } from 'react';

/**
 * Hook to check if the current user is a super admin.
 * Extracts the repeated pattern used across multiple components.
 *
 * @returns {boolean} Whether the current user is a super admin
 *
 * @example
 * ```tsx
 * const isSuperAdmin = useIsSuperAdmin();
 *
 * if (isSuperAdmin) {
 *   // Show admin-only features
 * }
 * ```
 */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuthUser();
  const playwrightAuth = getPlaywrightAuthState();

  return useMemo(() => {
    if (!user) {
      return playwrightAuth?.publicMetadata?.isSuperAdmin === true;
    }
    const publicData = getAuthPublicData(user);
    return publicData.isSuperAdmin === true;
  }, [playwrightAuth?.publicMetadata, user]);
}
