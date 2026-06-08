import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useMenuShared({
  config,
  onClose,
  renderTopSlot,
  renderBody,
  renderAfterNavigation,
  renderFooterSlot,
}: Pick<
  MenuSharedProps,
  | 'config'
  | 'onClose'
  | 'renderTopSlot'
  | 'renderBody'
  | 'renderAfterNavigation'
  | 'renderFooterSlot'
>) {
  const logoUrl = useThemeLogo();
  const rawPathname = usePathname();
  const { href, orgHref, orgSlug, brandSlug } = useOrgUrl();
  const [isConversationsCollapsed, setIsConversationsCollapsed] =
    useState(false);
  const { nestedGroupId, enterNestedGroup, exitNestedGroup } =
    useSidebarNavigation();

  const routeScope = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);

    if (parts[0] === 'settings') {
      return 'personal' as const;
    }

    if (parts[1] === '~') {
      return 'organization' as const;
    }

    return 'brand' as const;
  }, [rawPathname]);

  /** Strip org/brand prefix so we can compare against config-level paths. */
  const pathname = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[1] === '~') {
      return `/${parts.slice(2).join('/')}`;
    }
    if (parts.length >= 3) {
      return `/${parts.slice(2).join('/')}`;
    }
    return rawPathname;
  }, [rawPathname]);

  const isAlreadyScopedHref = useCallback(
    (path: string) => {
      const parts = path.split('/').filter(Boolean);

      return (
        parts[0] === orgSlug &&
        (parts[1] === '~' || (brandSlug && parts[1] === brandSlug))
      );
    },
    [brandSlug, orgSlug],
  );

  const resolveLegacySettingsHref = useCallback(
    (path: string) => {
      if (path === '/settings/personal') {
        return '/settings';
      }

      if (path === '/settings/organization') {
        return orgHref('/settings');
      }

      if (path.startsWith('/settings/organization/')) {
        return orgHref(path.replace('/settings/organization', '/settings'));
      }

      if (path.startsWith('/settings/brands/')) {
        const [, , , routeBrandSlug, ...rest] = path.split('/');

        if (routeBrandSlug) {
          const suffix = rest.length > 0 ? `/${rest.join('/')}` : '';
          return `/${orgSlug}/${routeBrandSlug}/settings${suffix}`;
        }
      }

      return orgHref(path);
    },
    [orgHref, orgSlug],
  );

  /** Prefix a config-level path with the configured route scope. */
  const prefixHref = useCallback(
    (
      item:
        | MenuItemConfig
        | { href: string; hrefScope?: MenuItemConfig['hrefScope'] },
    ) => {
      const path = item.href;

      if (!path) {
        return undefined;
      }

      if (isAlreadyScopedHref(path)) {
        return path;
      }

      if (item.hrefScope === 'personal') {
        return path;
      }

      if (item.hrefScope === 'organization') {
        return resolveLegacySettingsHref(path);
      }

      if (item.hrefScope === 'brand') {
        return href(path);
      }

      if (path.startsWith('/settings')) {
        return resolveLegacySettingsHref(path);
      }

      return href(path);
    },
    [href, isAlreadyScopedHref, resolveLegacySettingsHref],
  );

  const primaryItems = useMemo(
    () => config.items.filter((item) => item.isPrimary),
    [config.items],
  );

  const navigationItems = useMemo(
    () => config.items.filter((item) => !item.isPrimary),
    [config.items],
  );

  const secondaryItems = useMemo(
    () => config.secondaryItems ?? [],
    [config.secondaryItems],
  );

  const isActive = useCallback(
    (itemHref: string) => {
      if (!itemHref) {
        return false;
      }

      if (
        itemHref.startsWith('/elements/') &&
        pathname?.startsWith('/elements/')
      ) {
        return true;
      }
      if (
        itemHref.startsWith('/ingredients/') &&
        pathname?.startsWith('/ingredients/')
      ) {
        return true;
      }

      return pathname === itemHref || pathname?.startsWith(itemHref);
    },
    [pathname],
  );

  const isActiveItem = useCallback(
    (item: MenuItemConfig) => {
      if (!item.href) {
        return false;
      }

      if (item.hrefScope && item.hrefScope !== routeScope) {
        return false;
      }

      return isActive(item.href);
    },
    [isActive, routeScope],
  );

  // Group items by their group field, preserving order
  const groupedItems = useMemo(() => {
    const groups: { group: string; items: MenuItemConfig[] }[] = [];
    let currentGroup: string | undefined;

    navigationItems.forEach((item) => {
      const group = item.group ?? '';
      if (group !== currentGroup) {
        currentGroup = group;
        groups.push({ group, items: [item] });
      } else {
        groups[groups.length - 1].items.push(item);
      }
    });

    return groups;
  }, [navigationItems]);

  const topLevelGroups = useMemo(
    () => groupedItems.filter((group) => group.group === ''),
    [groupedItems],
  );

  const sectionGroups = useMemo(
    () => groupedItems.filter((group) => group.group !== ''),
    [groupedItems],
  );

  const handleLinkClick = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Get the nested group (for SidebarNested)
  const nestedGroup = useMemo(() => {
    if (!nestedGroupId) {
      return null;
    }
    return groupedItems.find((g) => g.group === nestedGroupId) ?? null;
  }, [groupedItems, nestedGroupId]);

  // Keyboard: Escape exits nested view
  useEffect(() => {
    if (!nestedGroupId) {
      return;
    }

    const processKeyDownMenuShared = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitNestedGroup();
      }
    };

    document.addEventListener('keydown', processKeyDownMenuShared);
    return () =>
      document.removeEventListener('keydown', processKeyDownMenuShared);
  }, [nestedGroupId, exitNestedGroup]);

  return {
    logoUrl,
    href,
    orgHref,
    orgSlug,
    brandSlug,
    isConversationsCollapsed,
    setIsConversationsCollapsed,
    nestedGroupId,
    enterNestedGroup,
    exitNestedGroup,
    prefixHref,
    isActiveItem,
    primaryItems,
    secondaryItems,
    groupedItems,
    topLevelGroups,
    sectionGroups,
    handleLinkClick,
    nestedGroup,
    topSlotContent: renderTopSlot ? renderTopSlot() : null,
    bodyContent: renderBody ? renderBody() : null,
    afterNavigationContent: renderAfterNavigation
      ? renderAfterNavigation()
      : null,
    footerSlotContent: renderFooterSlot ? renderFooterSlot() : null,
  };
}
