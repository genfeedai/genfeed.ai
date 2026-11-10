'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { useHasAppsBeyondDashboard } from '@/components/shell/use-available-rail-apps';

/**
 * Settings → Modules lists the apps an organization can show. While the
 * organization has no app beyond the dashboard there is nothing to choose, so
 * the page is not served, the same as its hidden menu entry.
 */
export default function ModulesRouteGate({
  children,
}: {
  children: ReactNode;
}) {
  const { settingsLoading } = useBrand();
  const hasAppsBeyondDashboard = useHasAppsBeyondDashboard();

  if (settingsLoading) {
    return null;
  }

  if (!hasAppsBeyondDashboard) {
    notFound();
  }

  return children;
}
