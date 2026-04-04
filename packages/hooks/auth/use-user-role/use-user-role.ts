import { useUser } from '@clerk/nextjs';
import type { MemberRole } from '@genfeedai/enums';
import {
  getClerkPublicData,
  getPlaywrightAuthState,
} from '@helpers/auth/clerk.helper';
import { useMemo } from 'react';

export function useUserRole(): MemberRole | undefined {
  const { user } = useUser();
  const playwrightAuth = getPlaywrightAuthState();

  return useMemo(() => {
    if (!user) {
      return (playwrightAuth?.publicMetadata as Record<string, unknown> | null)
        ?.role as MemberRole | undefined;
    }
    const publicData = getClerkPublicData(user);
    return (publicData as unknown as Record<string, unknown>).role as
      | MemberRole
      | undefined;
  }, [playwrightAuth?.publicMetadata, user]);
}
