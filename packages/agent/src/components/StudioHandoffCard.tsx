import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiArrowTopRightOnSquare, HiPaintBrush } from 'react-icons/hi2';

interface StudioHandoffCardProps {
  action: AgentUiAction;
}

export function StudioHandoffCard({
  action,
}: StudioHandoffCardProps): ReactElement {
  const thumbnailUrl = action.thumbnailUrl;
  const editorType = action.editorType ?? 'Editor';
  const studioUrl = action.studioUrl ?? '#';

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-background">
      {/* Thumbnail */}
      {thumbnailUrl && (
        <div className="bg-muted">
          <img
            src={thumbnailUrl}
            alt="Content preview"
            className="h-auto max-h-40 w-full object-contain"
          />
        </div>
      )}

      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <HiPaintBrush className="h-5 w-5 text-indigo-500" />
          <h3 className="text-sm font-semibold">
            {action.title || 'Open in Studio'}
          </h3>
        </div>

        {action.description && (
          <p className="mb-3 text-xs text-muted-foreground">
            {action.description}
          </p>
        )}

        {/* Editor type badge */}
        <div className="mb-3">
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            {editorType}
          </span>
        </div>

        {/* Open in Studio button */}
        <a
          href={studioUrl}
          className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <HiArrowTopRightOnSquare className="h-4 w-4" />
          Open in Studio
        </a>
      </div>
    </div>
  );
}
