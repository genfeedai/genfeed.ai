import type { ReactElement } from 'react';

type StatItem = {
  label: string;
  value: string;
};

type MissionControlStatsGridProps = {
  stats: StatItem[];
};

export function MissionControlStatsGrid({
  stats,
}: MissionControlStatsGridProps): ReactElement {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            {stat.label}
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
