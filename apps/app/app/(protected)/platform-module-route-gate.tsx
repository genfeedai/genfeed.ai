'use client';

import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { useIsSuperAdmin } from '@hooks/auth/use-is-super-admin/use-is-super-admin';
import { useFeatureFlagContext } from '@hooks/feature-flags/provider';
import { getAppRailFlagKeyForPath } from '@ui/shell/app-rail/app-rail.registry';
import { notFound, usePathname } from 'next/navigation';

/**
 * 404 on a route whose module an operator switched off in Admin → Flags
 * (#5468), matching the API. Superadmins pass, as on the API, so an operator
 * can still inspect a module that is hidden from everyone else.
 */
export default function PlatformModuleRouteGate({ children }: LayoutProps) {
  const { flags } = useFeatureFlagContext();
  const isSuperAdmin = useIsSuperAdmin();
  const flagKey = getAppRailFlagKeyForPath(usePathname() ?? undefined);

  if (flagKey && flags[flagKey] === false && !isSuperAdmin) {
    notFound();
  }

  return children;
}
