import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import { type ReactElement, useCallback, useState } from 'react';
import { HiCheck, HiClipboardDocumentList, HiXMark } from 'react-icons/hi2';

interface ReviewItem {
  id: string;
  title: string;
  type?: string;
  platform?: string;
  previewUrl?: string;
}

interface ReviewGateCardProps {
  action: AgentUiAction;
  onApprove?: (ids: string[]) => void;
  onReject?: (ids: string[]) => void;
}

export function ReviewGateCard({
  action,
  onApprove,
  onReject,
}: ReviewGateCardProps): ReactElement {
  const items = (action.items ?? []) as ReviewItem[];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acted, setActed] = useState(false);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((item) => item.id)));
  }, [items]);

  const handleApprove = useCallback(() => {
    const ids = Array.from(selected);
    onApprove?.(ids);
    setActed(true);
  }, [selected, onApprove]);

  const handleReject = useCallback(() => {
    const ids = Array.from(selected);
    onReject?.(ids);
    setActed(true);
  }, [selected, onReject]);

  if (acted) {
    return (
      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 my-2">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="w-5 h-5" />
          <span className="text-sm font-medium">
            Review submitted for {selected.size} item
            {selected.size !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 my-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HiClipboardDocumentList className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-sm">
            {action.title || 'Review Queue'}
          </h3>
        </div>
        <button
          onClick={selectAll}
          className="text-xs text-blue-500 hover:text-blue-600"
          type="button"
        >
          Select All
        </button>
      </div>

      {action.description && (
        <p className="text-xs text-muted-foreground mb-3">
          {action.description}
        </p>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.map((item) => (
          <label
            key={item.id}
            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
              selected.has(item.id)
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                : 'bg-muted border border-transparent'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggleItem(item.id)}
              className="rounded border-gray-300 text-blue-600"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block">
                {item.title}
              </span>
              {(item.type || item.platform) && (
                <span className="text-xs text-muted-foreground">
                  {[item.type, item.platform].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </label>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No items to review
        </p>
      )}

      {items.length > 0 && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          <button
            onClick={handleApprove}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-black bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            type="button"
          >
            <HiCheck className="w-3.5 h-3.5" />
            Approve ({selected.size})
          </button>
          <button
            onClick={handleReject}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-black bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            type="button"
          >
            <HiXMark className="w-3.5 h-3.5" />
            Reject ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}
