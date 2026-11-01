import type { ImgHTMLAttributes } from 'react';

/** The `next/image` props the extension's stand-in understands. */
export interface NextImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'src'> {
  alt: string;
  fill?: boolean;
  priority?: boolean;
  quality?: number | string;
  placeholder?: string;
  blurDataURL?: string;
  src: string | { src: string };
  unoptimized?: boolean;
}
