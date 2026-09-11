'use client';

import {
  buildSettingsSearchCatalog,
  resolveSettingsSearchHref,
} from '@app-config/settings-search-catalog';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { SettingsSurface } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import type { SettingsSearchItem } from '@genfeedai/props/ui/settings-search/settings-search.props';
import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { Settings } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Destinations the coarse commands in `commands.registry.ts` already cover
 * (Personal Settings, Organization Settings, Brand Management, Billing) —
 * excluded per scope below so the palette doesn't list the same page twice.
 * Keyed per scope because the same relative path constant (e.g. `SETTINGS.ROOT`)
 * resolves to a different absolute URL depending on scope (brand's "Profile"
 * reuses `SETTINGS.ROOT` too, but resolves through the brand route, not
 * personal settings — it must stay listed).
 */
const COARSE_HREFS_BY_SCOPE: Record<SettingsSurface, ReadonlySet<string>> = {
  [SettingsSurface.PERSONAL]: new Set([
    APP_ROUTES.SETTINGS.ROOT,
    APP_ROUTES.SETTINGS.PERSONAL,
  ]),
  [SettingsSurface.ORGANIZATION]: new Set([
    APP_ROUTES.SETTINGS.GENERAL,
    APP_ROUTES.SETTINGS.BRANDS,
    APP_ROUTES.SETTINGS.CREDITS,
    APP_ROUTES.SETTINGS.SUBSCRIPTION,
  ]),
  [SettingsSurface.BRAND]: new Set(),
};

/**
 * Route params drive the settings page the operator is currently viewing —
 * never the session-backfilled `useOrgUrl` slugs, which would make every
 * flat `/settings/*` page look brand-scoped whenever a brand is selected.
 */
function resolveCurrentSettingsScope(routeParams: {
  brandSlug?: string;
  orgSlug?: string;
}): SettingsSurface {
  if (routeParams.brandSlug) {
    return SettingsSurface.BRAND;
  }
  if (routeParams.orgSlug) {
    return SettingsSurface.ORGANIZATION;
  }
  return SettingsSurface.PERSONAL;
}

/** A bare page link (no `#section`) that duplicates a coarse command's target. */
function isCoarseDuplicate(scope: SettingsSurface, href: string): boolean {
  if (href.includes('#')) {
    return false;
  }
  return COARSE_HREFS_BY_SCOPE[scope].has(href);
}

/** Anchored settings results (e.g. `/settings/personal#appearance`) scroll to
 * their section instead of relying on the browser's default hash jump, which
 * next/navigation's client-side push does not perform on its own. */
function scrollToSettingsHash(href: string): void {
  const hashIndex = href.indexOf('#');
  if (hashIndex < 0) {
    return;
  }

  const hash = href.slice(hashIndex + 1);
  if (!hash) {
    return;
  }

  document.getElementById(hash)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

interface BuildScopeCommandsOptions {
  brandSlug: string;
  currentScope: SettingsSurface;
  isEnterprise: boolean;
  navigate: (href: string) => void;
  orgSlug: string;
}

function toCommand(
  item: SettingsSearchItem,
  href: string,
  { currentScope, navigate }: BuildScopeCommandsOptions,
): ICommand {
  return {
    action: () => navigate(href),
    category: 'settings',
    description: item.description,
    icon: Settings,
    id: `settings-catalog:${item.id}`,
    keywords: item.keywords,
    label: item.label,
    // Boost the settings page currently on screen so it ranks first in
    // search without hiding the other scopes' results.
    priority: item.scope === currentScope ? 7 : 5,
  };
}

function buildCommandsForScope(
  scope: SettingsSurface,
  options: BuildScopeCommandsOptions,
): ICommand[] {
  return buildSettingsSearchCatalog({
    isEnterprise: options.isEnterprise,
    scope,
  })
    .filter((item) => !isCoarseDuplicate(scope, item.href))
    .flatMap((item) => {
      const href = resolveSettingsSearchHref(item, {
        brandSlug: options.brandSlug,
        orgSlug: options.orgSlug,
      });

      return href ? [toCommand(item, href, options)] : [];
    });
}

/**
 * Registers the real settings destinations (personal, organization, brand)
 * as command-palette commands, sourced from the same catalog the old
 * settings-only `Search settings…` dropdown used — so the shared ⌘K palette
 * can reach every settings page, not just the four coarse shortcuts in
 * `commands.registry.ts`.
 *
 * Tiered by session availability: personal items always register;
 * organization items once an org is known; brand items only once a session
 * brand exists — never gated on the URL alone, so results follow the
 * operator across routes instead of a second URL-driven settings finder.
 */
export function useSettingsCommandsRegistration(): void {
  const router = useRouter();
  const routeParams = useParams<{ brandSlug?: string; orgSlug?: string }>();
  const currentScope = resolveCurrentSettingsScope(routeParams);
  const { selectedBrand } = useBrand();
  const { confirmedOrganizationSlug } = useRoutedOrganization();
  const orgSlug =
    confirmedOrganizationSlug || getBrandOrganizationSlug(selectedBrand);
  const brandSlug = selectedBrand?.slug ?? '';
  const isEnterprise = hasOrganizationBillingHint();

  useEffect(() => {
    const navigate = (href: string) => {
      router.push(href);
      scrollToSettingsHash(href);
    };

    const options: BuildScopeCommandsOptions = {
      brandSlug,
      currentScope,
      isEnterprise,
      navigate,
      orgSlug,
    };

    const commands: ICommand[] = [
      ...buildCommandsForScope(SettingsSurface.PERSONAL, options),
      ...(orgSlug
        ? buildCommandsForScope(SettingsSurface.ORGANIZATION, options)
        : []),
      ...(orgSlug && brandSlug
        ? buildCommandsForScope(SettingsSurface.BRAND, options)
        : []),
    ];

    const registeredIds =
      commands.length > 0
        ? CommandPaletteService.registerCommands(commands)
        : [];

    return () => {
      if (registeredIds.length > 0) {
        CommandPaletteService.unregisterCommands(registeredIds);
      }
    };
  }, [brandSlug, currentScope, isEnterprise, orgSlug, router]);
}
