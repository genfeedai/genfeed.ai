import type { RowSidebarBreakdownProps } from '@genfeedai/props/ui/display/row-sidebar-blocks.props';
import { Progress } from '@ui/primitives/progress';
import { Skeleton } from '@ui/primitives/skeleton';

/** Labelled share bars (e.g. engagement per platform) for a row's sidebar. */
export default function RowSidebarBreakdown({
  emptyLabel,
  isLoading = false,
  rows,
}: RowSidebarBreakdownProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {row.icon}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {row.value}
            </span>
          </div>
          <Progress
            aria-label={row.label}
            size="xs"
            tone="neutral"
            value={Math.min(Math.max(row.share, 0), 100)}
          />
        </li>
      ))}
    </ul>
  );
}
