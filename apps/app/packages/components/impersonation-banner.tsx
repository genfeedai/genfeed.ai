'use client';

import { authClient, useSession } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/contracts';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { VenetianMask } from 'lucide-react';
import { useState } from 'react';

const ADMIN_USERS_PATH = '/admin/administration/users';

/**
 * App-shell-wide banner shown while a superadmin impersonates a user via the
 * Better Auth admin plugin (#2423). `session.impersonatedBy` carries the
 * operator's User.id, so its presence is the impersonation signal; Exit calls
 * `stopImpersonating`, which restores the operator session parked in the
 * signed `admin_session` cookie.
 */
export default function ImpersonationBanner() {
  const { data: session } = useSession();
  const [isExiting, setIsExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  const impersonatedBy = session?.session?.impersonatedBy;
  if (!impersonatedBy) {
    return null;
  }

  const viewingAs = session?.user?.name || session?.user?.email || 'user';

  const handleExit = async () => {
    setExitError(null);
    setIsExiting(true);
    try {
      const { error } = await authClient.admin.stopImpersonating();
      if (error) {
        throw new Error(error.message ?? 'Stop impersonating failed');
      }
      // Full navigation (not router.push) so every cached query, token, and
      // org-scoped store rebuilds from the restored operator session.
      window.location.assign(ADMIN_USERS_PATH);
    } catch (error) {
      logger.error('Failed to stop impersonating', error);
      setExitError('Unable to exit impersonation. Try again.');
      setIsExiting(false);
    }
  };

  return (
    <div
      role="alert"
      data-testid="impersonation-banner"
      className="flex w-full items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-bold text-amber-950"
    >
      <VenetianMask className="size-5 shrink-0" />
      <span>Viewing as {viewingAs}</span>
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => {
          void handleExit();
        }}
        isDisabled={isExiting}
        className="rounded-md border border-amber-950/30 px-2 py-0.5 font-bold transition-colors hover:bg-amber-950/10"
        label="Exit"
      />
      {exitError ? <span role="status">{exitError}</span> : null}
    </div>
  );
}
