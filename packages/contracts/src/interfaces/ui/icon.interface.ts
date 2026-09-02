import type { ComponentType, SVGProps } from 'react';

export type IconType = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    color?: string;
    title?: string;
  }
>;
