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

  const emailAddress = user.primaryEmailAddress?.emailAddress ?? '';
  // The footer shows an identity, not a contact card: prefer the real name and
  // fall back to the email's local part rather than painting the full address.
  const displayName =
    user.fullName ?? (emailAddress ? emailAddress.split('@')[0] : 'User');

  if (isCollapsed) {
    return (
      <div className="border-t border-border p-3 flex justify-center">
        <UserDropdown
          imageUrl={user.imageUrl}
          userName={displayName}
          userEmail={emailAddress}
        />
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5">
        <UserDropdown
          imageUrl={user.imageUrl}
          userName={displayName}
          userEmail={emailAddress}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground/88">
            {displayName}
          </p>
        </div>
      </div>
    </div>
  );
}
