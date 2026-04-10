'use client';

import type { BaseMenuProps } from '@genfeedai/props/navigation/menu.props';
import MenuShared from '@ui/menus/shared/MenuShared';
import { createMarketplaceMenuConfig } from '@ui/menus/shared/menu-config.factory';

export default function MarketplaceSidebar({ onClose }: BaseMenuProps = {}) {
  const config = createMarketplaceMenuConfig({
    imagesHref: '/images',
    logoHref: '/',
    videosHref: '/videos',
  });

  return <MenuShared config={config} onClose={onClose} />;
}
