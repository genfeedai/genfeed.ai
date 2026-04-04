'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { SidebarHeaderProps } from '@props/navigation/sidebar-header.props';
import MenuBrandSwitcher from '@ui/menus/switchers/MenuBrandSwitcher';
import { memo } from 'react';

/**
 * SidebarHeader - Brand switcher for the dual-column sidebar panel.
 * Logo and hamburger toggle now live in the icon rail (MenuShared).
 */
const SidebarHeader = memo(function SidebarHeader({
  showBrandSwitcher = false,
  brands = [],
  brandId = '',
  onBrandChange,
  isUpdatingBrand,
  isCollapsed = false,
}: SidebarHeaderProps) {
  if (isCollapsed) {
    return null;
  }

  const isLoading = showBrandSwitcher && brands.length === 0 && !brandId;

  return (
    <div className="flex items-center gap-2">
      {/* Brand Switcher */}
      {showBrandSwitcher && (
        <div className={cn('relative z-[100] flex-1 min-w-0')}>
          {isLoading ? (
            <div className="flex items-center justify-center h-8">
              <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full opacity-50" />
            </div>
          ) : (
            <MenuBrandSwitcher
              brands={brands}
              brandId={brandId}
              onBrandChange={onBrandChange}
              isUpdatingBrand={isUpdatingBrand}
            />
          )}
        </div>
      )}
    </div>
  );
});

export default SidebarHeader;
