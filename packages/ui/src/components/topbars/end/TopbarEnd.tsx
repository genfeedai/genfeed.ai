'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';

export default function TopbarEnd() {
  const { isSignedIn } = useAuthIdentity();
  const { user } = useAuthUser();

  if (!user || !isSignedIn) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <UserDropdown
        settingsScope="user"
        side="bottom"
        userName={user.fullName ?? 'User'}
        userEmail={user.primaryEmailAddress?.emailAddress ?? ''}
      />
    </div>
  );
}
