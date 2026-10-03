'use client';

import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { useIsSuperAdmin } from '@hooks/auth/use-is-super-admin/use-is-super-admin';
import { useFeatureFlagContext } from '@hooks/feature-flags/provider';
import { getAppRailFlagKeyForPath } from '@ui/shell/app-rail/app-rail.registry';
import { notFound, usePathname } from 'next/navigation';
import { isStudioSurfaceEnabled } from '@/lib/platform-flags/studio-surface-flags';

/**
 * 404 on a route whose module or Studio surface an operator switched off in
 * Admin → Flags (#5468), matching the API. Superadmins pass, as on the API, so
 * an operator can still inspect a module that is hidden from everyone else.
 */
export default function PlatformModuleRouteGate({ children }: LayoutProps) {
  const { flags } = useFeatureFlagContext();
  const isSuperAdmin = useIsSuperAdmin();
  const pathname = usePathname() ?? undefined;
  const flagKey = getAppRailFlagKeyForPath(pathname);
  const isRouteOff =
    (flagKey !== undefined && flags[flagKey] === false) ||
    !isStudioSurfaceEnabled(pathname, flags);

  if (isRouteOff && !isSuperAdmin) {
    notFound();
  }

  return children;
}
