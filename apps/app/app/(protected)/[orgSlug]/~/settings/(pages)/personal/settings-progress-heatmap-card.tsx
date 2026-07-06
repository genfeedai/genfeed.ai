'use client';

import type { IStreakCalendarDay } from '@genfeedai/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';

type Props = {
  heatmapDays: string[];
  calendar: Record<string, IStreakCalendarDay>;
};

export default function SettingsProgressHeatmapCard({
  heatmapDays,
  calendar,
}: Props) {
  return (
    <Card className="border-white/10 bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Last 90 days
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Creation heatmap
          </h2>
        </div>
        <p className="text-sm text-foreground/60">
          Darker cells mean more generated or published pieces.
        </p>
      </div>

      <div className="grid grid-cols-9 gap-2 md:grid-cols-15 lg:grid-cols-18">
        {heatmapDays.map((dayKey) => {
          const count = calendar[dayKey]?.count ?? 0;
          const intensityClass =
            count >= 4
              ? 'bg-orange-300/80 border-orange-200/60'
              : count >= 2
                ? 'bg-orange-300/45 border-orange-300/40'
                : count >= 1
                  ? 'bg-orange-300/25 border-orange-300/25'
                  : 'bg-card border-white/8';

          return (
            <div
              key={dayKey}
              className={cn(
                'aspect-square rounded border transition-colors',
                intensityClass,
              )}
              title={`${dayKey}${count > 0 ? `: ${count} item${count === 1 ? '' : 's'}` : ''}`}
            />
          );
        })}
      </div>
    </Card>
  );
}
