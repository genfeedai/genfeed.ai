import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
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
    activeHref,
    brandSlug,
    href,
    isActive,
    orgHref,
    orgSlug,
    pathname,
    prefixHref,
    routeScope,
  } = useMenuRouteResolution();

  const getItemMatchScore = useCallback(
    (item: MenuItemConfig): number => {
      if (
        !item.href ||
        (item.hrefScope &&
          item.hrefScope !== 'global' &&
          item.hrefScope !== routeScope)
      )
        return -1;
      const matchingPaths = [item.href, ...(item.matchPaths ?? [])].filter(
        (path) => {
          const itemPathname = path.split('?')[0] ?? path;
          return (
            (!item.isExactMatch || pathname === itemPathname) &&
            isActive(path, item.matchSearchParams)
          );
        },
      );
      if (matchingPaths.length === 0) return -1;
      const specificity = Math.max(
        ...matchingPaths.map((path) => path.split('?')[0].length),
      );
      return (
        specificity * 1000 + Object.keys(item.matchSearchParams ?? {}).length
      );
    },
    [isActive, pathname, routeScope],
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

  const isActiveItem = useCallback(
    (item: MenuItemConfig) => {
      const score = getItemMatchScore(item);
      return (
        score >= 0 &&
        !config.items.some(
          (candidate) =>
            candidate !== item && getItemMatchScore(candidate) > score,
        )
      );
    },
    [config.items, getItemMatchScore],
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
    activeHref,
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
