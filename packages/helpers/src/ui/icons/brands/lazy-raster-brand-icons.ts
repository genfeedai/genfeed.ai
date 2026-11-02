'use client';

import {
  type ComponentType,
  createElement,
  lazy,
  Suspense,
  type SVGProps,
} from 'react';

type BrandIconProps = SVGProps<SVGSVGElement>;

type RasterBrandIconLoader = () => Promise<{
  default: ComponentType<BrandIconProps>;
}>;

/**
 * The raster logos weigh about 100 kB. Loading them with the model picker put
 * that weight on every route that shows one (Agent, Playground), before the
 * page could paint. They now load the first time one is drawn; until then an
 * empty svg holds the same box, so nothing shifts.
 */
function createLazyRasterBrandIcon(
  name: string,
  load: RasterBrandIconLoader,
): ComponentType<BrandIconProps> {
  const LazyIcon = lazy(load);

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

export const ArgilIcon = createLazyRasterBrandIcon('ArgilIcon', () =>
  import('./model-provider-raster-icons').then((icons) => ({
    default: icons.ArgilIcon,
  })),
);
export const CrunIcon = createLazyRasterBrandIcon('CrunIcon', () =>
  import('./model-provider-raster-icons').then((icons) => ({
    default: icons.CrunIcon,
  })),
);
export const HeygenIcon = createLazyRasterBrandIcon('HeygenIcon', () =>
  import('./model-provider-raster-icons').then((icons) => ({
    default: icons.HeygenIcon,
  })),
);
export const LeonardoIcon = createLazyRasterBrandIcon('LeonardoIcon', () =>
  import('./model-provider-raster-icons').then((icons) => ({
    default: icons.LeonardoIcon,
  })),
);
export const WanIcon = createLazyRasterBrandIcon('WanIcon', () =>
  import('./model-provider-raster-icons').then((icons) => ({
    default: icons.WanIcon,
  })),
);
