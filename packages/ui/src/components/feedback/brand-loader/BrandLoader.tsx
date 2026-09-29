import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import BrandMark from '@ui/primitives/brand-mark';

export interface BrandLoaderProps {
  className?: string;
  label?: string;
}

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
