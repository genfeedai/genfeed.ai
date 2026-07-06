'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AmbientColorWashProps } from '@genfeedai/props/ui/ambient-color-wash.props';
import type { CSSProperties } from 'react';

const INTENSITY_CLASS: Record<
  NonNullable<AmbientColorWashProps['intensity']>,
  string
> = {
  bold: 'gen-ambient-wash--bold',
  default: '',
  subtle: 'gen-ambient-wash--subtle',
};

/**
 * Low-opacity radial wash rendered BEHIND media content, tinted by the dominant
 * colour of the focused asset. The app literally takes on the content's colour
 * while every control stays grayscale (DESIGN.md → "Color Entry"). Returns
 * `null` when no colour is supplied so the wash disables gracefully.
 */
export default function AmbientColorWash({
  color,
  intensity = 'default',
  position = 'top',
  className,
}: AmbientColorWashProps): React.JSX.Element | null {
  if (!color) {
    return null;
  }

  const style = { '--gen-ambient-color': color } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'gen-ambient-wash',
        position === 'center' && 'gen-ambient-wash--center',
        INTENSITY_CLASS[intensity],
        className,
      )}
      style={style}
    />
  );
}
