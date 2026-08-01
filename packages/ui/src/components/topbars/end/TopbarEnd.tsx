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

  const emailAddress = user.primaryEmailAddress?.emailAddress ?? '';
  const composedName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayName =
    user.fullName?.trim() ||
    composedName ||
    (emailAddress.includes('@') ? emailAddress.split('@')[0] : null) ||
    'User';

  return (
    <div className="flex items-center gap-1">
      <UserDropdown
        settingsScope="user"
        side="bottom"
        imageUrl={user.imageUrl}
        userName={displayName}
        userEmail={emailAddress}
      />
    </div>
  );
}
