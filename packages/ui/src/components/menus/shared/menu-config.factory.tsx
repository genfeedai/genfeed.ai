import type { MenuConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { HiPhoto, HiVideoCamera } from 'react-icons/hi2';

interface MarketplaceMenuOptions {
  logoHref: string;
  videosHref: string;
  imagesHref: string;
}

export function createMarketplaceMenuConfig({
  logoHref,
  videosHref,
  imagesHref,
}: MarketplaceMenuOptions): MenuConfig {
  return {
    isAppDropdownEnabled: false,
    isBrandDropdownEnabled: false,
    isReturnButtonEnabled: false,
    items: [
      {
        href: videosHref,
        icon: <HiVideoCamera className="w-4 h-4" />,
        label: 'Videos',
      },
      {
        href: imagesHref,
        icon: <HiPhoto className="w-4 h-4" />,
        label: 'Images',
      },
    ],
    logoHref,
  };
}
