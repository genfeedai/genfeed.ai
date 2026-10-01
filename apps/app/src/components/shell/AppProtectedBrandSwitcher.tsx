'use client';

import { isPersonalSettingsPage } from '@app-components/app-protected-layout.settings-scope';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { createOrganizationAppRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import MenuBrandSwitcher from '@ui/menus/switchers/MenuBrandSwitcher';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { resolveShellScope } from '@/components/shell/shell-scope';
import {
  getBrandSwitchHref,
  getCurrentBrandScopedPath,
  resolveOrganizationScopePath,
} from '@/lib/navigation/operator-shell';

type AppProtectedBrandSwitcherProps = {
  brandSlug?: string;
  /** Admin chrome has no brand scope to switch. */
  isAdminChrome?: boolean;
  orgSlug?: string;
};

/**
 * Topbar brand switcher. The organization lives on the app rail; the
 * breadcrumb sits to the right of this control.
 */
export default function AppProtectedBrandSwitcher({
  brandSlug,
  isAdminChrome = false,
  orgSlug,
}: AppProtectedBrandSwitcherProps) {
  const pathname = usePathname() ?? '';
  const { push } = useRouter();
  const translate = useTranslations('common.sidebar');
  const { brandId, brands, selectedBrand, setBrandId, setOrganizationId } =
    useBrand();
  // Route props are authoritative; only fall back to useOrgUrl when the shell
  // is rendered without route context.
  const { brandSlug: resolvedBrandSlug, orgSlug: resolvedOrgSlug } =
    useOrgUrl();
  const { effectiveOrgSlug, isOrganizationScopeRoute, visibleBrandId } =
    resolveShellScope({
      brandId,
      brandSlug,
      brands,
      orgSlug,
      resolvedBrandSlug,
      resolvedOrgSlug,
      selectedBrand,
    });
  const isOrganizationSettingsRoute =
    Boolean(effectiveOrgSlug) &&
    isOrganizationScopeRoute &&
    pathname.startsWith(`/${effectiveOrgSlug}/~/settings`);

  const handleBrandChange = useCallback(
    (nextBrandId: string) => {
      setBrandId(nextBrandId);

      const nextBrand = brands.find(
        (brand) => getBrandEntityId(brand) === nextBrandId,
      );
      const nextOrganizationId = getBrandOrganizationId(nextBrand);
      const nextOrgSlug =
        getBrandOrganizationSlug(nextBrand) || effectiveOrgSlug;

      if (nextOrganizationId) {
        setOrganizationId(nextOrganizationId);
      }

      if (nextOrgSlug && nextBrand?.slug) {
        // Stay on the surface (agent, studio, …) but drop a selected
        // conversation — that thread belongs to the previous brand.
        push(
          getBrandSwitchHref({
            nextBrandSlug: nextBrand.slug,
            nextOrgSlug,
            pathname,
          }),
        );
      }
    },
    [brands, effectiveOrgSlug, pathname, push, setBrandId, setOrganizationId],
  );

  const handleClearBrandSelection = useCallback(() => {
    setBrandId('');

    if (effectiveOrgSlug) {
      // Drop brand scope. Shared surfaces keep the same path under `~`;
      // brand-only settings (publishing, voice, …) fall back to org brands
      // instead of a 404 on /:org/~/settings/publishing.
      push(
        createOrganizationAppRoute(
          effectiveOrgSlug,
          resolveOrganizationScopePath(getCurrentBrandScopedPath(pathname)),
        ),
      );
    }
  }, [effectiveOrgSlug, pathname, push, setBrandId]);

  // The page itself (never the session-backfilled useOrgUrl slugs) decides
  // whether this is a personal-account settings page, flat or org-scoped copy,
  // so no brand switcher appears there even with a brand in session (#4659).
  if (
    isAdminChrome ||
    brands.length === 0 ||
    isOrganizationSettingsRoute ||
    isPersonalSettingsPage(pathname)
  ) {
    return null;
  }

  return (
    <MenuBrandSwitcher
      variant="labeled"
      brands={brands}
      brandId={visibleBrandId}
      onBrandChange={handleBrandChange}
      clearSelectionAction={
        visibleBrandId
          ? {
              ariaLabel: translate('clearBrandSelection'),
              onSelect: handleClearBrandSelection,
            }
          : undefined
      }
    />
  );
}
