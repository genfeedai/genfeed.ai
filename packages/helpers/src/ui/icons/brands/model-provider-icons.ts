import { createElement, type SVGProps } from 'react';

function createBrandIcon(pathD: string) {
  return function BrandIcon(props: SVGProps<SVGSVGElement>) {
    return createElement(
      'svg',
      {
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        'aria-hidden': true,
        ...props,
      },
      createElement('path', { d: pathD }),
    );
  };
}

export const ArgilIcon = createBrandIcon('M12 2.2 22.8 21.2H1.2L12 2.2z');

export const FalIcon = createBrandIcon(
  'M13.2 2 3.6 13.2h6.6l-1.2 8.8 10.8-12h-6.6L13.2 2z',
);

export const HeygenIcon = createBrandIcon(
  'M4 4h5v6.4h6V4h5v16h-5v-6.4H9V20H4V4z',
);

export const HiggsfieldIcon = createBrandIcon(
  'M2.6 12 8.2 3h4.6l-5.6 9 5.6 9H8.2L2.6 12zm8.6 0L16.8 3h4.6l-5.6 9 5.6 9h-4.6L11.2 12z',
);

export const IdeogramIcon = createBrandIcon(
  'M12 1.6 14.2 9l7.4 2.2-7.4 2.2L12 20.8 9.8 13.4 2.4 11.2 9.8 9 12 1.6z',
);

export const KlingIcon = createBrandIcon(
  'M4.2 3h5.2v7.1L16.8 3H23l-8.6 9.1L23 21h-6.2l-7.4-7.1V21H4.2V3z',
);

export const LumaIcon = createBrandIcon(
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.2 10.2A6.2 6.2 0 0 1 8 17.1 7.8 7.8 0 1 0 16.2 12.2z',
);

export const MinimaxIcon = createBrandIcon(
  'M2.5 19.5V4.5h4.2l5.3 7.2 5.3-7.2h4.2v15h-4.6v-8l-4.9 6.3-4.9-6.3v8H2.5z',
);

export const MoonshotIcon = createBrandIcon(
  'M13.2 3.2a9.2 9.2 0 1 0 7.6 13.4 7.2 7.2 0 1 1-7.6-13.4z',
);

export const PrunaIcon = createBrandIcon(
  'M12 2C8.4 8.2 6.4 12.2 6.4 16a5.6 5.6 0 0 0 11.2 0c0-3.8-2-7.8-5.6-14z',
);

export const QwenIcon = createBrandIcon(
  'M12 2a10 10 0 1 0 7.1 17.1l2.2 2.2 1.4-1.4-2.1-2.1A10 10 0 0 0 12 2zm0 2.4a7.6 7.6 0 1 1 0 15.2 7.6 7.6 0 0 1 0-15.2z',
);

export const ReplicateIcon = createBrandIcon(
  'M12 1.6 22.4 7.6v8.8L12 22.4 1.6 16.4V7.6L12 1.6zm0 2.8L4.4 8.8v6.4L12 20l7.6-4.8V8.8L12 4.4z',
);

export const RunwayIcon = createBrandIcon(
  'M3.2 6.4h4.2v11.2H3.2V6.4zm6.7-3.2h4.2v17.6H9.9V3.2zm6.7 4.8h4.2v9.6h-4.2V8z',
);

export const TopazIcon = createBrandIcon(
  'M12 1.8 21.6 12 12 22.2 2.4 12 12 1.8z',
);

export const WanIcon = createBrandIcon(
  'M1.8 4.2h5.2L12 16.4 17 4.2h5.2L15.4 20.2h-6.8L1.8 4.2z',
);
