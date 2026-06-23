import type { MemberRole } from '@genfeedai/enums';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import {
  getAuthPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/auth.helper';
import { useMemo } from 'react';

export function useUserRole(): MemberRole | undefined {
  const { user } = useAuthUser();
  const playwrightAuth = getPlaywrightAuthState();

  return useMemo(() => {
    if (!user) {
      return (playwrightAuth?.publicMetadata as Record<string, unknown> | null)
        ?.role as MemberRole | undefined;
    }
    const publicData = getAuthPublicData(user);
    return (publicData as unknown as Record<string, unknown>).role as
      | MemberRole
      | undefined;
  }, [playwrightAuth?.publicMetadata, user]);
}
