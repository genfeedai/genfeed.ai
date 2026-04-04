import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import { type ReactElement, useCallback, useState } from 'react';
import { HiCheck, HiCurrencyDollar, HiRectangleStack } from 'react-icons/hi2';

interface BatchGenerationCardProps {
  action: AgentUiAction;
  onGenerate?: (payload: { count: number; platforms: string[] }) => void;
}

const AVAILABLE_PLATFORMS = [
  'twitter',
  'instagram',
  'linkedin',
  'tiktok',
  'facebook',
];

export function BatchGenerationCard({
  action,
  onGenerate,
}: BatchGenerationCardProps): ReactElement {
  const suggestedPlatforms = action.platforms ?? [];
  const [count, setCount] = useState(action.batchCount ?? 5);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(suggestedPlatforms),
  );
  const [isGenerated, setIsGenerated] = useState(false);

  const togglePlatform = useCallback((platform: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (count < 1 || selectedPlatforms.size === 0) {
      return;
    }
    onGenerate?.({
      count,
      platforms: Array.from(selectedPlatforms),
    });
    setIsGenerated(true);
  }, [count, selectedPlatforms, onGenerate]);

  const estimatedCredits =
    action.creditEstimate ?? count * selectedPlatforms.size * 10;

  if (isGenerated) {
    return (
      <div className="my-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">
            Batch generation started for {count} items
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiRectangleStack className="h-5 w-5 text-cyan-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Batch Generation'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Count input */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Number of items
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Platform checkboxes */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Platforms
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_PLATFORMS.map((platform) => (
            <label
              key={platform}
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors ${
                selectedPlatforms.has(platform)
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedPlatforms.has(platform)}
                onChange={() => togglePlatform(platform)}
                className="sr-only"
              />
              {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Credit estimate */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <HiCurrencyDollar className="h-3.5 w-3.5" />
        <span>Estimated cost: {estimatedCredits} credits</span>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={count < 1 || selectedPlatforms.size === 0}
        className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <HiRectangleStack className="h-4 w-4" />
        Generate
      </button>
    </div>
  );
}
