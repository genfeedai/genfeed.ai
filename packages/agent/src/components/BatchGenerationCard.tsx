import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Check, DollarSign, Layers } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';

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

/**
 * Flat tool fee for `generate_content_batch` (see
 * packages/tools/src/registry/source/overlap-generation.tools.ts `creditCost`).
 * Not per-item: the handler reports creditsUsed: 5 for the whole batch.
 */
const BATCH_TOOL_CREDIT_COST = 5;

export function BatchGenerationCard({
  action,
  onGenerate,
}: BatchGenerationCardProps): ReactElement {
  const suggestedPlatforms = action.platforms ?? [];
  const [count, setCount] = useState(action.batchCount ?? 5);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    () =>
      new Set(suggestedPlatforms.length > 0 ? suggestedPlatforms : ['twitter']),
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

  const estimatedCredits = action.creditEstimate ?? BATCH_TOOL_CREDIT_COST;

  if (isGenerated) {
    return (
      <div className="my-2 border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <Check className="size-5" />
          <span className="text-sm font-medium">
            Batch generation started for {count} items
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="size-5 text-cyan-500" />
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
        <label
          htmlFor="batch-count"
          className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Number of items
        </label>
        <Input
          id="batch-count"
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </div>

      {/* Platform checkboxes */}
      <div className="mb-3">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Platforms
        </span>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_PLATFORMS.map((platform) => (
            <label
              key={platform}
              className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors ${
                selectedPlatforms.has(platform)
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              <Input
                type="checkbox"
                isChecked={selectedPlatforms.has(platform)}
                onChange={() => togglePlatform(platform)}
                className="sr-only"
              />
              {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Credit estimate — flat batch tool fee, not count × platforms */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <DollarSign className="size-3.5" />
        <span>
          Estimated cost: {estimatedCredits} credit
          {estimatedCredits === 1 ? '' : 's'}
          <span className="text-muted-foreground/70">
            {' '}
            (flat batch fee, not per post)
          </span>
        </span>
      </div>

      {/* Generate button */}
      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={handleGenerate}
        isDisabled={count < 1 || selectedPlatforms.size === 0}
        icon={<Layers className="size-4" />}
        className="w-full justify-center"
      >
        Generate
      </Button>
    </div>
  );
}
