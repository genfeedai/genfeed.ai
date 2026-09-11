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
import type { AppContext } from '@genfeedai/contracts/interfaces';
import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import type { SettingsSearchItem } from '@genfeedai/props/ui/settings-search/settings-search.props';
import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
  isEnterprise: boolean;
  navigate: (href: string) => void;
  orgSlug: string;
  /** Boosted priority for a result matching the operator's current module. */
  priority: number;
}

function toCommand(
  item: SettingsSearchItem,
  href: string,
  options: BuildScopeCommandsOptions,
): ICommand {
  return {
    action: () => options.navigate(href),
    category: 'settings',
    description: item.description,
    icon: Settings,
    id: `settings-catalog:${item.id}`,
    keywords: item.keywords,
    label: item.label,
    priority: options.priority,
  };
}

function buildCommandsForScope(
  scope: SettingsSurface,
  options: BuildScopeCommandsOptions,
): ICommand[] {
  return buildSettingsSearchCatalog({
    isEnterprise: options.isEnterprise,
    scope,
  }).flatMap((item) => {
    const href = resolveSettingsSearchHref(item, {
      brandSlug: options.brandSlug,
      orgSlug: options.orgSlug,
    });

    return href ? [toCommand(item, href, options)] : [];
  });
}

/**
 * `currentApp` has no distinct value for Settings — it falls back to
 * 'workspace' there, same as the bare Workspace dashboard. Boosting on that
 * value ranks settings destinations first when the operator isn't deep in a
 * specialized creative module (Studio/Library/Publishing/Automation/
 * Analytics/Discovery/Messages/Agent), where a module-specific command
 * matching the same query should usually win instead (#4660 review: rank by
 * the current module, not by which settings sub-scope a result belongs to).
 */
function resolvePriority(currentApp: AppContext | undefined): number {
  return currentApp === 'workspace' || currentApp === undefined ? 7 : 5;
}

/**
 * Registers the real settings destinations (personal, organization, brand)
 * as command-palette commands, sourced from the same catalog the old
 * settings-only `Search settings…` dropdown used — so the shared ⌘K palette
 * can reach every settings page, including Personal/Organization
 * Settings/Brand Management/Billing (`commands.registry.ts` no longer
 * registers those separately — see its `createDefaultCommands` doc comment).
 *
 * Tiered by session availability: personal items always register;
 * organization items once an org is known; brand items only once a session
 * brand exists — never gated on the URL alone, so results follow the
 * operator across routes instead of a second URL-driven settings finder.
 */
export function useSettingsCommandsRegistration(currentApp?: AppContext): void {
  const router = useRouter();
  const { selectedBrand } = useBrand();
  const { confirmedOrganizationSlug } = useRoutedOrganization();
  const orgSlug =
    confirmedOrganizationSlug || getBrandOrganizationSlug(selectedBrand);
  const brandSlug = selectedBrand?.slug ?? '';
  const isEnterprise = hasOrganizationBillingHint();
  const priority = resolvePriority(currentApp);

  useEffect(() => {
    const navigate = (href: string) => {
      router.push(href);
      scrollToSettingsHash(href);
    };

    const options: BuildScopeCommandsOptions = {
      brandSlug,
      isEnterprise,
      navigate,
      orgSlug,
      priority,
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
  }, [brandSlug, isEnterprise, orgSlug, priority, router]);
}
