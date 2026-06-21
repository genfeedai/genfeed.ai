'use client';

import { UserButton, useAuth, useUser } from '@clerk/nextjs';
import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';

export default function TopbarEnd() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

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
      <div className="flex size-8 items-center justify-center">
        <UserButton />
      </div>
    </div>
  );
}
