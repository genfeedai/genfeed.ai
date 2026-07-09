import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuSharedProps } from '@genfeedai/props/navigation/menu.props';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMenuRouteResolution } from './useMenuRouteResolution';

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
  const [isConversationsCollapsed, setIsConversationsCollapsed] =
    useState(false);
  const { nestedGroupId, enterNestedGroup, exitNestedGroup } =
    useSidebarNavigation();
  const {
    brandSlug,
    href,
    isActive,
    orgHref,
    orgSlug,
    pathname,
    prefixHref,
    routeScope,
  } = useMenuRouteResolution();

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

  const isActiveItem = useCallback(
    (item: MenuItemConfig) => {
      if (!item.href) {
        return false;
      }

      if (
        item.hrefScope &&
        item.hrefScope !== 'global' &&
        item.hrefScope !== routeScope
      ) {
        return false;
      }

      // Root items that share a path prefix with their siblings (e.g. an
      // "Overview"/"General" at /settings sitting above /settings/members)
      // must match the current route exactly, otherwise they light up on every
      // descendant route. `pathname` is already normalized to the config-level
      // path, so compare against the item's config href directly.
      if (item.isExactMatch) {
        return pathname === item.href;
      }

      return isActive(item.href);
    },
    [isActive, pathname, routeScope],
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
