'use client';

import {
  BRAND_BANNER_HEIGHT,
  BRAND_BANNER_WIDTH,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import { cva, type VariantProps } from 'class-variance-authority';
import Image from 'next/image';
import type { ComponentPropsWithRef, ReactNode } from 'react';

const brandBannerVariants = cva(
  'group relative aspect-[3/1] w-full overflow-hidden bg-muted outline-media',
  {
    defaultVariants: { shape: 'square' },
    variants: {
      shape: { rounded: 'rounded-xl', square: '' },
    },
  },
);

export interface BrandBannerProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'>,
    VariantProps<typeof brandBannerVariants> {
  /** Banner picture. Without one the frame stays an empty tile. */
  src?: string | null;
  alt?: string;
  /** Responsive `sizes` hint for the picture. */
  sizes?: string;
  isPriority?: boolean;
  /** Drawn over the picture, such as edit actions. */
  children?: ReactNode;
}

/**
 * A brand's banner. The frame is always the X header ratio (1500x500, 3:1), so
 * what the owner crops on upload is exactly what every surface displays and
 * what X imports or exports.
 */
function BrandBanner({
  alt = '',
  children,
  className,
  isPriority = false,
  ref,
  shape,
  sizes = '100vw',
  src,
  ...props
}: BrandBannerProps) {
  return (
    <div
      ref={ref}
      className={cn(brandBannerVariants({ shape }), className)}
      data-ratio={`${BRAND_BANNER_WIDTH}x${BRAND_BANNER_HEIGHT}`}
      {...props}
    >
      {src ? (
        <Image
          alt={alt}
          className="object-cover object-center"
          fill
          priority={isPriority}
          sizes={sizes}
          src={src}
        />
      ) : null}
      {children}
    </div>
  );
}
BrandBanner.displayName = 'BrandBanner';

export { BrandBanner, brandBannerVariants };
