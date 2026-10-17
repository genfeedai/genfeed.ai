'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import type { TopbarAppsLinkProps } from '@genfeedai/props/ui/app-rail.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { Compass } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Explore: goes straight to the full-page home for every app. It sits in the
 * topbar so the rail holds only the core loop and the apps the member pinned.
 */
export default function TopbarAppsLink({ orgSlug }: TopbarAppsLinkProps) {
  const pathname = usePathname();
  const translate = useTranslations('common.appRail');
  const { orgSlug: resolvedOrgSlug } = useOrgUrl();
  const effectiveOrgSlug = orgSlug ?? resolvedOrgSlug;

  if (!effectiveOrgSlug) return null;

  const exploreHref = createOrganizationAppRoute(
    effectiveOrgSlug,
    APP_ROUTES.EXPLORE.ROOT,
  );
  const isActive =
    pathname === exploreHref || pathname?.startsWith(`${exploreHref}/`);

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
        href={exploreHref}
        prefetch={false}
      >
        <Compass aria-hidden="true" className="size-4" />
      </Link>
    </Button>
  );
}
