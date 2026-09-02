'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import { resolvePreferredLocale } from '@genfeedai/contracts/constants';
import { writeLocaleCookie } from '@helpers/ui/locale/locale-cookie.helper';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Mirrors the stored locale preference into the cookie that
 * `resolveRequestLocale` reads on the server, the same way `ThemeCookieSync`
 * mirrors the theme.
 *
 * The preference lives in the database so it follows the user between devices,
 * but the server render must not wait on a database read. So the first visit
 * from a new device renders in the negotiated locale, this component then
 * corrects the cookie and refreshes once; every later visit is already right.
 * `writeLocaleCookie` reports whether it actually changed anything, which is
 * what keeps the refresh from looping.
 */
export default function LocaleCookieSync() {
  const { refresh } = useRouter();
  const { currentUser } = useCurrentUser();
  const { settings } = useOrganization();

  const preferredLocale = resolvePreferredLocale({
    organizationLocale: settings?.defaultLocale,
    userLocale: currentUser?.settings?.locale,
  });

  useEffect(() => {
    if (!preferredLocale) {
      return;
    }

    if (writeLocaleCookie(preferredLocale)) {
      refresh();
    }
  }, [preferredLocale, refresh]);

  return null;
}
