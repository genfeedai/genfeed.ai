import type { RowSidebarStatsProps } from '@genfeedai/props/ui/display/row-sidebar-blocks.props';
import { Skeleton } from '@ui/primitives/skeleton';

/** Two-column grid of headline numbers for a row's right sidebar. */
export default function RowSidebarStats({
  isLoading = false,
  stats,
}: RowSidebarStatsProps) {
  return (
    <dl className="grid grid-cols-2 gap-2" aria-busy={isLoading}>
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3"
        >
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {isLoading ? <Skeleton className="h-6 w-16" /> : stat.value}
          </dd>
          {stat.hint && !isLoading ? (
            <dd className="text-xs text-muted-foreground">{stat.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
