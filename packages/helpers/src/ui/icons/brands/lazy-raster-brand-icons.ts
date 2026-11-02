'use client';

import {
  type ComponentType,
  createElement,
  lazy,
  Suspense,
  type SVGProps,
} from 'react';

type RasterBrandIconName =
  | 'ArgilIcon'
  | 'CrunIcon'
  | 'HeygenIcon'
  | 'LeonardoIcon'
  | 'WanIcon';

type BrandIconProps = SVGProps<SVGSVGElement>;

/**
 * The raster logos weigh about 100 kB. Loading them with the model picker put
 * that weight on every route that shows one (Agent, Playground), before the
 * page could paint. They now load the first time one is drawn; until then an
 * empty svg holds the same box, so nothing shifts.
 */
function createLazyRasterBrandIcon(
  name: RasterBrandIconName,
): ComponentType<BrandIconProps> {
  const LazyIcon = lazy(() =>
    import('./model-provider-raster-icons').then((icons) => ({
      default: icons[name],
    })),
  );

  function RasterBrandIcon(props: BrandIconProps) {
    return createElement(
      Suspense,
      {
        fallback: createElement('svg', {
          'aria-hidden': true,
          focusable: false,
          ...props,
        }),
      },
      createElement(LazyIcon, props),
    );
  }

  RasterBrandIcon.displayName = name;
  return RasterBrandIcon;
}

export const ArgilIcon = createLazyRasterBrandIcon('ArgilIcon');
export const CrunIcon = createLazyRasterBrandIcon('CrunIcon');
export const HeygenIcon = createLazyRasterBrandIcon('HeygenIcon');
export const LeonardoIcon = createLazyRasterBrandIcon('LeonardoIcon');
export const WanIcon = createLazyRasterBrandIcon('WanIcon');
