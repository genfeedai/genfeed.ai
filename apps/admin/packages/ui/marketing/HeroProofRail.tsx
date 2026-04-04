import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';

export interface HeroProofRailItem {
  label: string;
  value: ReactNode;
}

export interface HeroProofRailProps {
  className?: string;
  items: HeroProofRailItem[];
  title?: ReactNode;
}

export default function HeroProofRail({
  className,
  items,
  title = 'Proof',
}: HeroProofRailProps): React.ReactElement {
  return (
    <aside
      className={cn(
        'border-t border-[var(--gen-accent-border)] pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0',
        className,
      )}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--gen-accent-text)]">
        {title}
      </p>
      <div className="mt-4 space-y-4">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/38">
              {item.label}
            </p>
            <div className="text-sm leading-relaxed text-foreground/84">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
