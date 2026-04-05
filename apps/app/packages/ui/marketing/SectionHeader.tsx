import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  tierLabel?: string;
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  className?: string;
}

export default function SectionHeader({
  className,
  description,
  extra,
  tierLabel,
  title,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-16 text-center', className)}>
      {tierLabel ? (
        <div className="mb-6 text-xs font-black uppercase tracking-widest text-surface/20">
          {tierLabel}
        </div>
      ) : null}
      <h2 className="mb-6 text-6xl font-serif">{title}</h2>
      {description ? (
        <p className="mx-auto max-w-2xl text-lg text-surface/50">
          {description}
        </p>
      ) : null}
      {extra ? <div className="mt-4">{extra}</div> : null}
    </div>
  );
}
