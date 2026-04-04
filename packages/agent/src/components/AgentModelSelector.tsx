'use client';

import {
  AGENT_MODELS,
  type AgentModelOption,
} from '@genfeedai/agent/constants/agent-models.constant';
import { CostTier } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { type ReactElement, useState } from 'react';
import { HiChevronUp, HiLockClosed, HiSparkles } from 'react-icons/hi2';

const COST_TIER_COLORS: Record<CostTier, string> = {
  [CostTier.LOW]: 'text-green-400 bg-green-400/10',
  [CostTier.MEDIUM]: 'text-yellow-400 bg-yellow-400/10',
  [CostTier.HIGH]: 'text-orange-400 bg-orange-400/10',
};

interface AgentModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  creditsAvailable: number | null;
  onBuyCredits?: () => void;
}

export function AgentModelSelector({
  selectedModel,
  onModelChange,
  creditsAvailable,
  onBuyCredits,
}: AgentModelSelectorProps): ReactElement {
  const [open, setOpen] = useState(false);
  const current = AGENT_MODELS.find((m) => m.key === selectedModel);
  const hasLockedModels =
    creditsAvailable != null &&
    AGENT_MODELS.some(
      (m) => m.creditCost != null && m.creditCost > creditsAvailable,
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {current?.isReasoning && (
            <HiSparkles className="h-3 w-3 text-purple-400" />
          )}
          <span>{current?.label ?? 'Select model'}</span>
          <CostBadge
            costTier={current?.costTier}
            creditCost={current?.creditCost}
          />
          <HiChevronUp
            className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-72 rounded-xl border border-border p-1.5"
      >
        <div className="flex flex-col gap-0.5">
          {AGENT_MODELS.map((model) => {
            const isLocked =
              creditsAvailable != null &&
              model.creditCost != null &&
              model.creditCost > creditsAvailable;
            const isSelected = model.key === selectedModel;

            return (
              <ModelRow
                key={model.key}
                model={model}
                isSelected={isSelected}
                isLocked={isLocked}
                onSelect={() => {
                  if (!isLocked) {
                    onModelChange(model.key);
                    setOpen(false);
                  }
                }}
              />
            );
          })}
        </div>
        {hasLockedModels && onBuyCredits && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <button
              type="button"
              onClick={() => {
                onBuyCredits();
                setOpen(false);
              }}
              className="w-full rounded px-2 py-1.5 text-center text-xs font-black text-primary transition-colors hover:bg-primary/10"
            >
              Buy Credits
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ModelRow({
  model,
  isSelected,
  isLocked,
  onSelect,
}: {
  model: AgentModelOption;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isLocked}
      title={isLocked ? `Need ${model.creditCost} credits` : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
        isSelected && 'bg-accent',
        isLocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent',
      )}
    >
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {model.isReasoning && (
            <HiSparkles className="h-3 w-3 text-purple-400" />
          )}
          <span className="font-medium text-foreground">{model.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {model.description}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <CostBadge costTier={model.costTier} creditCost={model.creditCost} />
        {isLocked && <HiLockClosed className="h-3 w-3 text-muted-foreground" />}
      </div>
    </button>
  );
}

function CostBadge({
  costTier,
  creditCost,
}: {
  costTier?: CostTier;
  creditCost?: number;
}): ReactElement | null {
  if (!costTier || creditCost == null) {
    return null;
  }

  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
        COST_TIER_COLORS[costTier],
      )}
    >
      {creditCost}cr
    </span>
  );
}
