'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import Button from '@ui/buttons/base/Button';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export interface MasonryBrandLogoProps {
  ingredient: IIngredient;
  isPublicGallery?: boolean;
  isPublicProfile?: boolean;
}

/**
 * Brand logo overlay for public gallery items
 * Navigates to brand page on click
 */
export default function MasonryBrandLogo({
  ingredient,
  isPublicGallery = false,
  isPublicProfile = false,
}: MasonryBrandLogoProps) {
  const router = useRouter();

  // Only show in public galleries, not on profile pages
  if (!isPublicGallery || isPublicProfile) {
    return null;
  }

  if (!ingredient.brandLogoUrl) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ingredient.brand) {
      const brandId =
        typeof ingredient.brand === 'string'
          ? ingredient.brand
          : ingredient.brand.id;
      router.push(`/brands/${brandId}`);
    }
  };

  return (
    <Button
      withWrapper={false}
      variant={ButtonVariant.UNSTYLED}
      className="cursor-pointer absolute top-0 left-0 m-1 w-6 h-6 rounded-full overflow-hidden shadow-lg z-10"
      onClick={handleClick}
      ariaLabel="View brand"
    >
      <Image
        src={ingredient.brandLogoUrl}
        alt="Brand logo"
        width={24}
        height={24}
        className="h-auto w-auto object-cover object-center"
        sizes="24px"
        loading="lazy"
      />
    </Button>
  );
}
