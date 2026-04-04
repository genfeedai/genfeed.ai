import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiArrowTrendingUp, HiFire, HiPencilSquare } from 'react-icons/hi2';

interface TrendingTopicsCardProps {
  action: AgentUiAction;
  onCreatePost?: (trend: { id: string; label: string }) => void;
}

export function TrendingTopicsCard({
  action,
  onCreatePost,
}: TrendingTopicsCardProps): ReactElement {
  const trends = action.trends ?? [];

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiFire className="h-5 w-5 text-orange-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Trending Topics'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {trends.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No trending topics found
        </p>
      ) : (
        <div className="space-y-1.5">
          {trends.map((trend) => (
            <div
              key={trend.id}
              className="flex items-center justify-between rounded bg-muted p-2.5"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <HiArrowTrendingUp className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                <div className="min-w-0">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {trend.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {trend.platform && (
                      <span className="text-[10px] text-muted-foreground">
                        {trend.platform}
                      </span>
                    )}
                    {trend.score != null && (
                      <span className="text-[10px] text-muted-foreground">
                        Score: {trend.score}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onCreatePost?.({ id: trend.id, label: trend.label })
                }
                className="ml-2 flex shrink-0 items-center gap-1 rounded bg-orange-50 px-2 py-1 text-[10px] font-medium text-orange-600 transition-colors hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
              >
                <HiPencilSquare className="h-3 w-3" />
                Create Post
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
