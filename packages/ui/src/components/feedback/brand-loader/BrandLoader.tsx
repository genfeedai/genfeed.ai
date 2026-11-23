import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import BrandMark from '@ui/primitives/brand-mark';

export interface BrandLoaderProps {
  className?: string;
  label?: string;
}

/**
 * The animated brand mark with its live-region label. Use `Loading` for a
 * region or page; use this only where the mark alone is wanted.
 */
export default function BrandLoader({
  className,
  label = 'Loading Genfeed',
}: BrandLoaderProps = {}) {
  return (
    <output
      aria-label={label}
      className={cn(
        'genfeed-loader-root inline-flex size-24 items-center justify-center text-foreground',
        className,
      )}
    >
      <BrandMark />
    </output>
  );
}
