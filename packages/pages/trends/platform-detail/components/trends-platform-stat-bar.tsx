'use client';

type TrendsPlatformStatBarProps = {
  feedModeLabel: string;
  totalTrends: number;
  totalItems: number;
};

export default function TrendsPlatformStatBar({
  feedModeLabel,
  totalTrends,
  totalItems,
}: TrendsPlatformStatBarProps) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
          Feed Type
        </span>
        <span className="text-lg font-semibold text-foreground">
          {feedModeLabel}
        </span>
      </div>
      <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
          Trend Topics
        </span>
        <span className="text-lg font-semibold text-foreground">
          {totalTrends}
        </span>
      </div>
      <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
          Source Items
        </span>
        <span className="text-lg font-semibold text-foreground">
          {totalItems}
        </span>
      </div>
    </div>
  );
}
