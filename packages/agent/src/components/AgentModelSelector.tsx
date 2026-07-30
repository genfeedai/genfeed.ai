'use client';

import {
  AGENT_MODELS,
  type AgentModelOption,
} from '@genfeedai/agent/constants/agent-models.constant';
import { ButtonVariant, CostTier } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { type ReactElement, useEffect, useState } from 'react';
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
  /** Match composer toolbar control height (send / icons). */
  density?: 'compact' | 'default';
  /** When true, block model switching (read-only / busy / blocked composer). */
  isDisabled?: boolean;
}

export function AgentModelSelector({
  selectedModel,
  onModelChange,
  creditsAvailable,
  onBuyCredits,
  density = 'default',
  isDisabled = false,
}: AgentModelSelectorProps): ReactElement {
  const [open, setOpen] = useState(false);
  // Drop leftover open state when the selector is disabled so re-enable cannot
  // immediately reopen a menu that was open when the busy state began.
  useEffect(() => {
    if (isDisabled) {
      setOpen(false);
    }
  }, [isDisabled]);
  const current = AGENT_MODELS.find((m) => m.key === selectedModel);
  const hasLockedModels =
    creditsAvailable != null &&
    AGENT_MODELS.some(
      (m) => m.creditCost != null && m.creditCost > creditsAvailable,
    );
  const isCompact = density === 'compact';

  return (
    <Popover
      open={isDisabled ? false : open}
      onOpenChange={(nextOpen) => {
        if (!isDisabled) {
          setOpen(nextOpen);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Select model"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          textTransform="none"
          isDisabled={isDisabled}
          className={cn(
            // Same height as send (size-8 / size-9) — trailing toolbar cluster
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background-secondary/40 px-2.5 text-xs text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
            isCompact ? 'h-8' : 'h-9',
          )}
        >
          {current?.isReasoning && (
            <HiSparkles className="size-3 text-purple-400" />
          )}
          <span>{current?.label ?? 'Select model'}</span>
          <CostBadge
            costTier={current?.costTier}
            creditCost={current?.creditCost}
          />
          <HiChevronUp
            className={cn('size-3 transition-transform', open && 'rotate-180')}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-72 border border-border bg-popover p-1.5 text-popover-foreground"
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
            <Button
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              onClick={() => {
                onBuyCredits();
                setOpen(false);
              }}
              className="w-full px-2 py-1.5 text-center text-xs font-black text-primary hover:bg-primary/10"
            >
              Buy Credits
            </Button>
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
  // Do not use Tailwind `bg-accent` inside `.ship-ui` popovers — ship remaps
  // accent to solid white/near-black brand chips, which fights
  // `text-foreground` / `text-muted-foreground` and produces white-on-white
  // (or black-on-black) selected rows. Use translucent foreground instead.
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      textTransform="none"
      onClick={onSelect}
      isDisabled={isLocked}
      ariaLabel={isLocked ? `Need ${model.creditCost} credits` : model.label}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
        isSelected
          ? 'bg-foreground/12 text-foreground ring-1 ring-inset ring-border'
          : 'text-foreground hover:bg-foreground/[0.06]',
        isLocked && 'cursor-not-allowed opacity-50',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {model.isReasoning && (
            <HiSparkles className="size-3 shrink-0 text-purple-400" />
          )}
          <span className="font-medium text-foreground">{model.label}</span>
        </div>
        <span className="text-[10px] leading-snug text-muted-foreground">
          {model.description}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <CostBadge costTier={model.costTier} creditCost={model.creditCost} />
        {isLocked && <HiLockClosed className="size-3 text-muted-foreground" />}
      </div>
    </Button>
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
