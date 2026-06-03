'use client';

type SectionHeaderProps = {
  label: string;
};

export function SectionHeader({ label }: SectionHeaderProps) {
  return (
    <div className="px-3 pb-1 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/30">
        {label}
      </span>
    </div>
  );
}
