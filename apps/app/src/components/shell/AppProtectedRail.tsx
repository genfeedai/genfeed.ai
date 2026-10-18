'use client';

import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { normalizeRailAppOrder } from '@genfeedai/contracts/constants';
import { useWorkspaceInboxCount } from '@genfeedai/hooks/data/tasks/use-workspace-inbox-count';
import type { AppProtectedRailProps } from '@genfeedai/props/ui/app-rail.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { AppRail } from '@ui/shell/app-rail/AppRail';
import RailAccount from '@ui/shell/app-rail/RailAccount';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback } from 'react';
import { useRailPreferencesContext } from '@/components/shell/rail-preferences.provider';
import { resolveShellScope } from '@/components/shell/shell-scope';
import { useAvailableRailApps } from '@/components/shell/use-available-rail-apps';
import { useMessagesUnreadCount } from '@/components/shell/use-messages-unread-count';
import {
  captureAppRailNavigation,
  captureAppRailReorder,
} from '@/lib/analytics/app-rail-analytics';
import { isAgentOnboardingPathname } from '@/lib/navigation/agent-onboarding-path';
import {
  appendSearchParamsToHref,
  pickOperatorTaskContextSearchParams,
} from '@/lib/navigation/operator-shell';
import { resolveWorkspaceSurfaceLaunch } from '@/lib/workspace-shell/workspace-surface-launcher';

function AppProtectedRailContent({
  brandSlug,
  isAdminChrome = false,
  onNavigate,
  orgSlug,
}: AppProtectedRailProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { brandId, brands, selectedBrand, settings } = useBrand();
  const { installedAppIds, moduleAccess, modulePreferences } =
    useAvailableRailApps();
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
  const workspaceCount = useWorkspaceInboxCount();
  const translateRail = useTranslations('common.appRail');
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
  const {
    hiddenAppIds,
    pinnedAppIds,
    railAppOrder,
    resetRail,
    setRailAppOrder,
    togglePin,
  } = useRailPreferencesContext();
  // A member's own order wins; until they set one, the rail follows the
  // organization's default. Resetting clears theirs and lands back on it.
  const effectiveRailAppOrder =
    railAppOrder.length > 0
      ? railAppOrder
      : normalizeRailAppOrder(settings?.defaultRailOrder);
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

      // A destination the shell registry does not know (an org-level app
      // entry such as `~/studio/storyboard`, resolved by its own route) must
      // keep its own link, not fall back to the current page.
      return {
        announcement: launch.announcement,
        href: launch.registryKey === null ? destinationHref : launch.href,
      };
    },
    [currentHref, searchParams],
  );

  if (!effectiveOrgSlug) {
    return null;
  }

  return (
    <AppRail
      surface={onNavigate ? 'drawer' : 'desktop'}
      onNavigationEvent={captureAppRailNavigation}
      onReorderEvent={captureAppRailReorder}
      footer={<RailAccount />}
      badges={{
        workspace: {
          count: workspaceCount,
          kind: 'dot',
          label: translateRail('workspaceBadge', { count: workspaceCount }),
        },
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
      isAdminChrome={isAdminChrome}
      installedAppIds={installedAppIds}
      isAssetGateLocked={isAssetGateLocked}
      isNavigationSuspended={isAgentOnboardingPathname(pathname)}
      moduleAccess={moduleAccess}
      modulePreferences={modulePreferences}
      hiddenAppIds={hiddenAppIds}
      onNavigate={onNavigate}
      onRailAppOrderChange={setRailAppOrder}
      onResetRail={resetRail}
      onTogglePin={togglePin}
      orgSlug={effectiveOrgSlug}
      pinnedAppIds={pinnedAppIds}
      railAppOrder={effectiveRailAppOrder}
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
