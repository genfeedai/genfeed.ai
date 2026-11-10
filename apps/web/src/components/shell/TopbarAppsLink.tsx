'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { Puzzle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useHasAppsBeyondDashboard } from '@/components/shell/use-available-rail-apps';
import type { TopbarAppsLinkProps } from '@/props/ui/app-rail.props';

/**
 * Apps: goes straight to the full-page home for every app. It sits in the
 * topbar so the rail holds only the core loop and the apps the member pinned.
 * Hidden while the organization has no app beyond the dashboard.
 */
export default function TopbarAppsLink({ orgSlug }: TopbarAppsLinkProps) {
  const pathname = usePathname();
  const translate = useTranslations('common.appRail');
  const { orgSlug: resolvedOrgSlug } = useOrgUrl();
  const hasAppsBeyondDashboard = useHasAppsBeyondDashboard();
  const effectiveOrgSlug = orgSlug ?? resolvedOrgSlug;

  // With only the dashboard released there is nothing to install or open.
  if (!effectiveOrgSlug || !hasAppsBeyondDashboard) return null;

  const appsHref = createOrganizationAppRoute(
    effectiveOrgSlug,
    APP_ROUTES.APPS.ROOT,
  );
  const isActive =
    pathname === appsHref || pathname?.startsWith(`${appsHref}/`);

  return (
    <Button
      asChild
      variant={ButtonVariant.GHOST}
      size={ButtonSize.ICON}
      className={cn('relative size-8', isActive && 'text-foreground')}
      data-active={isActive ? 'true' : 'false'}
      data-testid="topbar-apps-link"
      tooltip={translate('launcher')}
      withWrapper={false}
    >
      <Link
        aria-current={isActive ? 'page' : undefined}
        aria-label={translate('launcher')}
        href={appsHref}
      >
        <Puzzle aria-hidden="true" className="size-4" />
      </Link>
    </Button>
  );
}
