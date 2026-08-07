import { AGENT_CONVERSATION_SURFACE_CLASS } from '@genfeedai/agent/constants/conversation-layout.constant';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import {
  DEFAULT_BATCH_CONTENT_MIX,
  estimateBatchGenerationCredits,
  formatBatchPricingHint,
} from '@genfeedai/constants';
import { ButtonVariant, ContentFormat } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Check, DollarSign, Layers } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

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

  // Caption-first pricing (includeMedia: false) — same as server charge today.
  // Format mix still differentiates image vs video/reel packaging rates.
  const estimatedCredits = useMemo(() => {
    if (action.creditEstimate != null) {
      return action.creditEstimate;
    }
    return estimateBatchGenerationCredits(
      {
        contentMix: DEFAULT_BATCH_CONTENT_MIX,
        count: Math.max(1, count),
        platforms: Array.from(selectedPlatforms),
      },
      { includeMedia: false, qualityTier: 'balanced' },
    );
  }, [action.creditEstimate, count, selectedPlatforms]);

  const pricingHint = useMemo(
    () =>
      formatBatchPricingHint({ includeMedia: false, qualityTier: 'balanced' }),
    [],
  );

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
    <div
      className={cn(
        AGENT_CONVERSATION_SURFACE_CLASS,
        'my-1.5 w-full min-w-0 max-w-full p-3',
      )}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <Layers className="size-5 shrink-0 text-cyan-500" />
        <h3 className="min-w-0 truncate text-sm font-semibold">
          {action.title || 'Batch Generation'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {action.description}
        </p>
      )}

      {/* Stack controls — never put count + CTAs on one nowrap row (that was
          forcing the conversation track past the viewport). */}
      <div className="mb-3 min-w-0 space-y-1.5">
        <label
          htmlFor="batch-count"
          className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
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
          className="w-full min-w-0 max-w-[12rem]"
        />
      </div>

      <div className="mb-3 min-w-0">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Platforms
        </span>
        <div className="flex min-w-0 flex-wrap gap-2">
          {AVAILABLE_PLATFORMS.map((platform) => (
            <label
              key={platform}
              className={cn(
                'inline-flex max-w-full shrink-0 cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors',
                selectedPlatforms.has(platform)
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50',
              )}
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

      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <DollarSign className="size-3.5 shrink-0" />
        <span className="min-w-0 break-words">
          Estimated cost: {estimatedCredits} credit
          {estimatedCredits === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mb-3 break-words text-[10px] leading-4 text-muted-foreground/80 [overflow-wrap:anywhere]">
        Based on default mix (image{' '}
        {DEFAULT_BATCH_CONTENT_MIX[ContentFormat.IMAGE]}% / video{' '}
        {DEFAULT_BATCH_CONTENT_MIX[ContentFormat.VIDEO]}% / reel{' '}
        {DEFAULT_BATCH_CONTENT_MIX[ContentFormat.REEL]}% / carousel{' '}
        {DEFAULT_BATCH_CONTENT_MIX[ContentFormat.CAROUSEL]}%). {pricingHint}.
        Chat model round is billed separately.
      </p>

      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={handleGenerate}
        isDisabled={count < 1 || selectedPlatforms.size === 0}
        icon={<Layers className="size-4" />}
        className="w-full max-w-full justify-center"
      >
        Generate
      </Button>
    </div>
  );
}
