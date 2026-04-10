'use client';

import type { BaseMenuProps } from '@genfeedai/props/navigation/menu.props';
import MenuShared from '@ui/menus/shared/MenuShared';
import { createMarketplaceMenuConfig } from '@ui/menus/shared/menu-config.factory';

export default function WebsiteSidebar({ onClose }: BaseMenuProps = {}) {
  const config = createMarketplaceMenuConfig({
    imagesHref: '/marketplace/images',
    logoHref: '/marketplace',
    videosHref: '/marketplace/videos',
  });

  return <MenuShared config={config} onClose={onClose} />;
}
