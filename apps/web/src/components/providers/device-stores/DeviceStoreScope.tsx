'use client';

import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { getPlaywrightAuthState } from '@genfeedai/helpers/auth/auth.helper';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { setDeviceStoreScope } from '@/lib/device-stores/device-store-scope';

/**
 * Tells the device's saved copies who and what they are for: the signed-in
 * user and the organization the server confirmed for this page. Until both are
 * known no saved copy is read or written, and a copy saved for one user and
 * organization is never returned for another.
 *
 * The scope is set while rendering, not in an effect, because the readers of a
 * saved copy render below this component and must see the scope of the render
 * they are part of. It is a plain assignment of a value derived from props, so
 * a repeated render does the same thing.
 */
export default function DeviceStoreScope() {
  const { confirmedOrganizationId, isRouteConfirmed } = useRoutedOrganization();
  const { userId } = useAuthIdentity();
  const effectiveUserId = userId ?? getPlaywrightAuthState()?.userId ?? null;

  setDeviceStoreScope(
    isRouteConfirmed && confirmedOrganizationId && effectiveUserId
      ? { organizationId: confirmedOrganizationId, userId: effectiveUserId }
      : null,
  );

  return null;
}
