import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  className?: string;
}

export default function SectionHeader({
  className,
  description,
  extra,
  title,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-16 text-center', className)}>
      <h2 className="mb-6 text-6xl font-semibold leading-tight tracking-[-0.02em]">
        {title}
      </h2>
      {description ? (
        <p className="mx-auto max-w-2xl text-lg text-foreground/70">
          {description}
        </p>
      ) : null}
      {extra ? <div className="mt-4">{extra}</div> : null}
    </div>
  );
}
