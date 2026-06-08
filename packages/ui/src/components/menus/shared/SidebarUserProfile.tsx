'use client';

import { UserButton, useAuth, useUser } from '@clerk/nextjs';

import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';

export default function SidebarUserProfile({
  isCollapsed = false,
}: {
  isCollapsed?: boolean;
}) {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  if (!user) {
    return null;
  }

  if (isCollapsed) {
    return (
      <div className="border-t border-border p-3 flex justify-center">
        {isSignedIn ? <UserButton /> : null}
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5">
        {isSignedIn ? <UserButton /> : null}
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
