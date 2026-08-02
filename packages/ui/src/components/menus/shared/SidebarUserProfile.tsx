'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';

import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';

function resolveDisplayName(
  fullName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  emailAddress: string,
): string {
  const trimmedFull = fullName?.trim();
  if (trimmedFull) {
    return trimmedFull;
  }

  const composed = [firstName?.trim(), lastName?.trim()]
    .filter(Boolean)
    .join(' ');
  if (composed) {
    return composed;
  }

  if (emailAddress.includes('@')) {
    return emailAddress.split('@')[0] || 'User';
  }

  return emailAddress || 'User';
}

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
  // Identity chrome: human display name first, never a bare slug when name exists.
  const displayName = resolveDisplayName(
    user.fullName,
    user.firstName,
    user.lastName,
    emailAddress,
  );

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
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          {emailAddress ? (
            <p className="truncate text-xs text-muted-foreground">
              {emailAddress}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
