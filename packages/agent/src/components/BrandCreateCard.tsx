import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { type ReactElement, useCallback, useState } from 'react';
import { HiCheck, HiSparkles } from 'react-icons/hi2';

interface BrandCreateCardProps {
  action: AgentUiAction;
  onCreate?: (payload: { name: string; description: string }) => void;
}

export function BrandCreateCard({
  action,
  onCreate,
}: BrandCreateCardProps): ReactElement {
  const [name, setName] = useState(action.brandName ?? '');
  const [description, setDescription] = useState(action.brandDescription ?? '');
  const [isCreated, setIsCreated] = useState(false);

  const handleCreate = useCallback(() => {
    if (!name.trim()) {
      return;
    }
    onCreate?.({ description, name });
    setIsCreated(true);
  }, [name, description, onCreate]);

  if (isCreated) {
    return (
      <div className="my-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">
            Brand &quot;{name}&quot; created
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiSparkles className="h-5 w-5 text-pink-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Create Brand'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Name input */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Brand Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter brand name..."
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Description input */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Describe your brand..."
          className="w-full resize-none rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Create button */}
      <button
        type="button"
        onClick={handleCreate}
        disabled={!name.trim()}
        className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <HiSparkles className="h-4 w-4" />
        Create Brand
      </button>
    </div>
  );
}
