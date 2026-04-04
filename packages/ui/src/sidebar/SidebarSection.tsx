import type { ReactNode } from 'react';

interface SidebarSectionProps {
  label: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  return (
    <div>
      <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
        {label}
      </div>
      <div className="mt-0.5 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
