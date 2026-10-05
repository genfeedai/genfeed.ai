import { useOptionalUser } from '@genfeedai/contexts/user/user-context/user-context';
import { MemberRole } from '@genfeedai/contracts';
import { getPlaywrightAuthState } from '@helpers/auth/auth.helper';

export function useUserRole(): MemberRole | null | undefined {
  const userContext = useOptionalUser();
  const playwrightAuth = getPlaywrightAuthState();
  const publicMetadata = playwrightAuth?.publicMetadata;
  const playwrightRole =
    publicMetadata && 'role' in publicMetadata
      ? publicMetadata.role
      : undefined;
  if (playwrightRole) {
    return (
      Object.values(MemberRole).find((role) => role === playwrightRole) ?? null
    );
  }
  if (!userContext || userContext.memberRole === undefined) return undefined;
  return (
    Object.values(MemberRole).find((role) => role === userContext.memberRole) ??
    null
  );
}
