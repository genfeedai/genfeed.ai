'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  SectionHeaderAlign,
  SectionHeaderProps,
  SectionHeaderSize,
} from '@props/sections/section-header.props';
import { memo } from 'react';

const SIZE_CLASSES: Record<
  SectionHeaderSize,
  { title: string; description: string }
> = {
  lg: {
    description: 'text-lg',
    title: 'text-4xl sm:text-5xl',
  },
  md: {
    description: 'text-lg',
    title: 'text-3xl sm:text-4xl',
  },
  sm: {
    description: 'text-base',
    title: 'text-2xl sm:text-3xl',
  },
  xl: {
    description: 'text-xl',
    title: 'text-5xl md:text-6xl',
  },
};

const ALIGN_CLASSES: Record<SectionHeaderAlign, string> = {
  center: 'text-center mx-auto',
  left: 'text-left',
};

const SectionHeader = memo(function SectionHeader({
  icon: Icon,
  label,
  title,
  description,
  align = 'center',
  size = 'lg',
  className,
}: SectionHeaderProps) {
  const sizeConfig = SIZE_CLASSES[size];
  const alignClass = ALIGN_CLASSES[align];

  return (
    <div className={cn('mb-12', alignClass, className)}>
      {(Icon || label) && (
        <div className="inline-flex items-center gap-2 mb-4">
          {Icon && <Icon className="h-6 w-6 text-primary" />}
          {label && (
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">
              {label}
            </span>
          )}
        </div>
      )}

      <h2 className={cn('font-serif mb-4', sizeConfig.title)}>{title}</h2>

      {description && (
        <p
          className={cn(
            'text-foreground/70 max-w-2xl',
            sizeConfig.description,
            align === 'center' && 'mx-auto',
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
});

export default SectionHeader;
