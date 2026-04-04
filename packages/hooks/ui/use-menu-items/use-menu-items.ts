'use client';

import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useMemo } from 'react';

interface UseMenuItemsOptions {
  /** Static menu items to augment with dynamic credential entries */
  items: MenuItemConfig[];
  /** Label after which dynamic items are inserted in the Posts group */
  insertAfterLabel?: string;
}

export function useMenuItems({
  items,
  insertAfterLabel,
}: UseMenuItemsOptions): MenuItemConfig[] {
  const { credentials, settings } = useBrand();
  const isAdvancedMode = settings?.isAdvancedMode ?? false;

  return useMemo(() => {
    // Filter out advanced-only items when not in advanced mode
    const filteredItems = isAdvancedMode
      ? items
      : items.filter((item) => !item.advancedOnly);

    if (!credentials || credentials.length === 0) {
      return filteredItems;
    }

    const dynamicItems: MenuItemConfig[] = credentials
      .filter((cred) => cred.isConnected)
      .map((cred) => {
        const iconComponent = getPlatformIconComponent(cred.platform);
        return {
          credentialId: cred.id,
          group: 'Posts',
          href: `/posts?platform=${cred.platform}`,
          isDynamic: true,
          label: cred.externalHandle || cred.label || cred.platform,
          outline: iconComponent,
          solid: iconComponent,
        };
      });

    if (dynamicItems.length === 0) {
      return filteredItems;
    }

    const result = [...filteredItems];
    const insertIndex = result.findIndex(
      (item) => item.group === 'Posts' && item.label === insertAfterLabel,
    );

    if (insertIndex !== -1) {
      result.splice(insertIndex + 1, 0, ...dynamicItems);
    } else {
      // Fallback: append after last Posts item
      const lastPostsIndex = result.reduce(
        (last, item, idx) => (item.group === 'Posts' ? idx : last),
        -1,
      );
      if (lastPostsIndex !== -1) {
        result.splice(lastPostsIndex + 1, 0, ...dynamicItems);
      }
    }

    return result;
  }, [credentials, items, insertAfterLabel, isAdvancedMode]);
}
