'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';

import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';

export default function SidebarUserProfile({
  isCollapsed = false,
}: {
  isCollapsed?: boolean;
}) {
  const { isSignedIn } = useAuthIdentity();
  const { user } = useAuthUser();

  if (!user || !isSignedIn) {
    return null;
  }

  if (isCollapsed) {
    return (
      <div className="border-t border-border p-3 flex justify-center">
        <UserDropdown
          userName={user.fullName ?? 'User'}
          userEmail={user.primaryEmailAddress?.emailAddress ?? ''}
        />
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground/88">
            {user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'User'}
          </p>
        </div>
        <UserDropdown
          userName={user.fullName ?? 'User'}
          userEmail={user.primaryEmailAddress?.emailAddress ?? ''}
        />
      </div>
    </div>
  );
}
