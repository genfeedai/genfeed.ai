'use client';

import Badge from '@ui/display/badge/Badge';

type RelatedMetricCardProps = {
  badgeValue: number;
  detail?: string | null;
  title: string;
};

export default function RelatedMetricCard({
  badgeValue,
  detail,
  title,
}: RelatedMetricCardProps) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-background/80 p-4">
      <div className="space-y-2">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/55">
          <Badge variant="ghost">{Math.round(badgeValue)}</Badge>
          {detail ? <span>{detail}</span> : null}
        </div>
      </div>
    </div>
  );
}
