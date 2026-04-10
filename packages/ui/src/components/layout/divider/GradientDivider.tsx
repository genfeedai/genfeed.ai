'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GradientDividerProps } from '@genfeedai/props/ui/layout/divider.props';
import { memo } from 'react';

const SPACING_CLASSES = {
  lg: 'my-12',
  md: 'my-8',
  none: '',
  sm: 'my-4',
} as const;

const VARIANT_CLASSES = {
  gradient: 'gen-divider',
  solid: 'gen-divider-solid',
  vertical: 'gen-divider-vertical',
} as const;

/**
 * GradientDivider - A subtle divider with gradient fade
 * Uses CSS classes from genfeed.scss for consistent theming
 */
const GradientDivider = memo(function GradientDivider({
  className,
  spacing = 'md',
  variant = 'gradient',
}: GradientDividerProps) {
  return (
    <div
      className={cn(
        VARIANT_CLASSES[variant],
        SPACING_CLASSES[spacing],
        className,
      )}
      role="none"
      aria-hidden="true"
    />
  );
});

export default GradientDivider;
