'use client';

import { isPersonalSettingsPage } from '@app-components/app-protected-layout.settings-scope';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import OrganizationSwitcher from '@ui/menus/organization-switcher/OrganizationSwitcher';
import { AppRail } from '@ui/shell/app-rail/AppRail';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback } from 'react';

import { resolveShellScope } from '@/components/shell/shell-scope';
import { useMessagesUnreadCount } from '@/components/shell/use-messages-unread-count';
import {
  appendSearchParamsToHref,
  pickOperatorTaskContextSearchParams,
} from '@/lib/navigation/operator-shell';
import { resolveWorkspaceSurfaceLaunch } from '@/lib/workspace-shell/workspace-surface-launcher';

type AppProtectedRailProps = {
  brandSlug?: string;
  /** Admin chrome always offers Admin, independent of platform access. */
  isAdminChrome?: boolean;
  /** Injected by AppLayout into the mobile drawer copy to close the drawer. */
  onNavigate?: () => void;
  orgSlug?: string;
};

function AppProtectedRailContent({
  brandSlug,
  isAdminChrome = false,
  onNavigate,
  orgSlug,
}: AppProtectedRailProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { brandId, brands, selectedBrand, settings } = useBrand();
  const { isAssetGateLocked, isSuperAdmin } = useAccessState();
  const { brandSlug: resolvedBrandSlug, orgSlug: resolvedOrgSlug } =
    useOrgUrl();
  const { brandAwareAppSlug, effectiveBrandSlug, effectiveOrgSlug } =
    resolveShellScope({
      brandId,
      brandSlug,
      brands,
      orgSlug,
      resolvedBrandSlug,
      resolvedOrgSlug,
      selectedBrand,
    });
  const translateMessages = useTranslations('common.messages');
  // The Messages item opens the brand in the URL, else the org-wide inbox:
  // the badge counts the same scope. While the route names a brand but
  // `brands` hasn't loaded it yet, the scope is unresolved — never fall back
  // to the org-wide count in that gap, or the badge flashes the wrong number
  // before swapping to the brand-scoped one once brands load.
  const messagesBadgeBrand = effectiveBrandSlug
    ? brands.find((brand) => brand.slug === effectiveBrandSlug)
    : undefined;
  const isMessagesBadgeScopeResolved =
    !effectiveBrandSlug || Boolean(messagesBadgeBrand);
  const messagesBadgeBrandId = messagesBadgeBrand
    ? getBrandEntityId(messagesBadgeBrand) || undefined
    : undefined;
  const messagesUnreadCount = useMessagesUnreadCount(
    messagesBadgeBrandId,
    isMessagesBadgeScopeResolved,
  );

  const currentHref = appendSearchParamsToHref(
    pathname,
    new URLSearchParams(searchParams.toString()),
  );
  const preservedTaskSearch = pickOperatorTaskContextSearchParams(
    new URLSearchParams(searchParams.toString()),
  ).toString();
  const resolveRailNavigation = useCallback(
    (destinationHref: string) => {
      const launch = resolveWorkspaceSurfaceLaunch({
        currentHref,
        destinationHref,
        threadId: searchParams.get('thread'),
      });

      return {
        announcement: launch.announcement,
        href: launch.href,
      };
    },
    [currentHref, searchParams],
  );

  if (!effectiveOrgSlug) {
    return null;
  }

  return (
    <AppRail
      header={
        // Slack workspace icon. Personal-account settings pages have no org
        // context to switch from (#4659).
        isPersonalSettingsPage(pathname) ? undefined : (
          <OrganizationSwitcher
            subscriptionTier={settings?.subscriptionTier}
            variant="avatar"
          />
        )
      }
      badges={{
        messages: {
          count: messagesUnreadCount,
          label: translateMessages('unreadBadge', {
            count: messagesUnreadCount,
          }),
        },
      }}
      brandAwareSlug={brandAwareAppSlug}
      brandSlug={effectiveBrandSlug}
      currentPath={pathname}
      isAssetGateLocked={isAssetGateLocked}
      onNavigate={onNavigate}
      orgSlug={effectiveOrgSlug}
      preservedSearch={preservedTaskSearch || undefined}
      resolveNavigation={resolveRailNavigation}
      showAdmin={isAdminChrome || isSuperAdmin}
    />
  );
}

export default function AppProtectedRail(props: AppProtectedRailProps) {
  return (
    <Suspense fallback={null}>
      <AppProtectedRailContent {...props} />
    </Suspense>
  );
}
