'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import type { TopbarAppsLinkProps } from '@genfeedai/props/ui/app-rail.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useHoverAnimatedIcon } from '@ui/primitives/animated-icons/use-hover-animated-icon';
import { Button } from '@ui/primitives/button';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * The Apps entry: goes straight to the Store, the full-page home for every
 * app. It sits in the topbar so the rail holds only the core loop and the
 * apps the member pinned.
 */
export default function TopbarAppsLink({ orgSlug }: TopbarAppsLinkProps) {
  const pathname = usePathname();
  const translate = useTranslations('common.appRail');
  const { orgSlug: resolvedOrgSlug } = useOrgUrl();
  const effectiveOrgSlug = orgSlug ?? resolvedOrgSlug;
  // The button is `asChild`, so it never sees the icon: drive it from here.
  const { hoverProps, icon } = useHoverAnimatedIcon(
    <LayoutGrid aria-hidden="true" className="size-4" />,
  );

  if (!effectiveOrgSlug) return null;

  const storeHref = createOrganizationAppRoute(
    effectiveOrgSlug,
    APP_ROUTES.STORE.ROOT,
  );
  const isActive =
    pathname === storeHref || pathname?.startsWith(`${storeHref}/`);

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
      {...hoverProps}
    >
      <Link
        aria-current={isActive ? 'page' : undefined}
        aria-label={translate('launcher')}
        href={storeHref}
        prefetch={false}
      >
        {icon}
      </Link>
    </Button>
  );
}
