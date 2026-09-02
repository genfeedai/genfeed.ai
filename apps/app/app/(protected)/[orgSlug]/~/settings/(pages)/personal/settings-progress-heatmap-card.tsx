'use client';

import type { IStreakCalendarDay } from '@genfeedai/contracts/types';
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
    <Card
      label="Creation heatmap"
      description="Last 90 days. Darker cells mean more generated or published pieces."
      bodyClassName="gap-3 p-4"
    >
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
                  : 'bg-card border-border';

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
