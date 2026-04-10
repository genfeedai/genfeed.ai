'use client';

import { BentoSize, BentoSpan, BentoVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { BentoItemProps } from '@genfeedai/props/ui/ui.props';
import { memo } from 'react';

const SPAN_CLASSES = {
  [BentoSpan.DOUBLE]: 'md:col-span-2',
  [BentoSpan.FULL]: 'col-span-full',
  [BentoSpan.SINGLE]: '',
} as const;

const ROW_SPAN_CLASSES = {
  1: '',
  2: 'md:row-span-2',
} as const;

const SIZE_CLASSES = {
  [BentoSize.LG]: 'rounded-3xl p-8 md:p-10',
  [BentoSize.MD]: 'rounded-2xl p-6 md:p-8',
  [BentoSize.SM]: 'rounded-xl p-4 md:p-5',
} as const;

const VARIANT_CLASSES = {
  [BentoVariant.BLACK]: 'bg-black text-white',
  [BentoVariant.DEFAULT]: 'bg-card text-card-foreground',
  [BentoVariant.WHITE]: 'bg-white text-black',
} as const;

const BentoItem = memo(function BentoItem({
  span = BentoSpan.SINGLE,
  rowSpan = 1,
  variant = BentoVariant.DEFAULT,
  size = BentoSize.MD,
  className,
  children,
}: BentoItemProps) {
  return (
    <div
      className={cn(
        'transition-all duration-300',
        SIZE_CLASSES[size],
        SPAN_CLASSES[span],
        ROW_SPAN_CLASSES[rowSpan],
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </div>
  );
});

export default BentoItem;
