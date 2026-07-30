'use client';

import {
  AGENT_MODELS,
  type AgentModelOption,
} from '@genfeedai/agent/constants/agent-models.constant';
import { COST_TIER_DISPLAY } from '@genfeedai/constants';
import { ButtonVariant, type CostTier } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { ChevronUp, Lock, Search, Sparkles } from 'lucide-react';
import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type AgentModelSelectorProps = {
  selectedModel: string;
  onModelChange: (model: string) => void;
  creditsAvailable: number | null;
  onBuyCredits?: () => void;
  /** Match composer toolbar control height (send / icons). */
  density?: 'compact' | 'default';
  /** When true, block model switching (read-only / busy / blocked composer). */
  isDisabled?: boolean;
};

type ModelRowProps = {
  model: AgentModelOption;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: () => void;
};

type CostBadgeProps = {
  costTier?: CostTier;
};

function costTierDisplay(costTier?: CostTier) {
  if (!costTier) {
    return null;
  }

  return COST_TIER_DISPLAY[costTier] ?? null;
}

function clearSearchAndClose(
  setOpen: (isOpen: boolean) => void,
  setSearchTerm: (term: string) => void,
): void {
  setSearchTerm('');
  setOpen(false);
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
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Drop leftover open state when the selector is disabled so re-enable cannot
  // immediately reopen a menu that was open when the busy state began.
  useEffect(() => {
    if (isDisabled) {
      setOpen(false);
      setSearchTerm('');
    }
  }, [isDisabled]);

  const current = AGENT_MODELS.find((m) => m.key === selectedModel);
  const hasLockedModels =
    creditsAvailable != null &&
    AGENT_MODELS.some(
      (m) => m.creditCost != null && m.creditCost > creditsAvailable,
    );
  const isCompact = density === 'compact';
  const currentCost = costTierDisplay(current?.costTier);

  const filteredModels = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return AGENT_MODELS;
    }

    return AGENT_MODELS.filter((model) => {
      const haystack =
        `${model.label} ${model.description} ${model.key}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchTerm]);

  return (
    <Popover
      open={isDisabled ? false : open}
      onOpenChange={(isPopoverOpen) => {
        if (isDisabled) {
          return;
        }
        setOpen(isPopoverOpen);
        if (!isPopoverOpen) {
          setSearchTerm('');
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
            'inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg text-xs text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
            isCompact
              ? 'h-8 max-w-[7.5rem] px-1.5'
              : 'h-9 shrink-0 gap-1.5 px-2',
          )}
        >
          {current?.isReasoning && (
            <Sparkles className="size-3 shrink-0 text-purple-400" />
          )}
          <span className="min-w-0 truncate">
            {current?.label ?? 'Select model'}
          </span>
          {currentCost ? (
            <span
              className={cn(
                'shrink-0 text-[10px] font-bold tabular-nums',
                currentCost.colorClass.split(' ')[0],
              )}
              title={`Cost tier ${currentCost.symbol}`}
            >
              {currentCost.symbol}
            </span>
          ) : null}
          <ChevronUp
            className={cn(
              'size-3 shrink-0 transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="flex w-80 flex-col gap-0 overflow-hidden border border-border bg-background p-0 text-foreground"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSearchTerm(event.target.value);
              }}
              placeholder="Search models…"
              inputRef={searchInputRef}
              aria-label="Search models"
              className="h-8 rounded-md border-border bg-foreground/[0.03] pl-8 text-xs"
            />
          </div>
        </div>
        {/* Native button list — no listbox/option roles without roving focus. */}
        <div
          className="flex max-h-72 flex-col gap-0.5 overflow-y-auto p-1.5"
          aria-label="Models"
          role="group"
        >
          {filteredModels.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
              No models match “{searchTerm.trim()}”
            </p>
          ) : (
            filteredModels.map((model) => {
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
                      clearSearchAndClose(setOpen, setSearchTerm);
                    }
                  }}
                />
              );
            })
          )}
        </div>
        {hasLockedModels && onBuyCredits ? (
          <div className="border-t border-border p-1.5">
            <Button
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              onClick={() => {
                onBuyCredits();
                // Controlled close does not always fire onOpenChange — clear
                // the filter here so reopen cannot show a stale searchTerm.
                clearSearchAndClose(setOpen, setSearchTerm);
              }}
              className="w-full px-2 py-1.5 text-center text-xs font-black text-primary hover:bg-primary/10"
            >
              Buy Credits
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ModelRow({
  model,
  isSelected,
  isLocked,
  onSelect,
}: ModelRowProps): ReactElement {
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
            <Sparkles className="size-3 shrink-0 text-purple-400" />
          )}
          <span className="font-medium text-foreground">{model.label}</span>
        </div>
        <span className="text-[10px] leading-snug text-muted-foreground">
          {model.description}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <CostBadge costTier={model.costTier} />
        {isLocked ? <Lock className="size-3 text-muted-foreground" /> : null}
      </div>
    </Button>
  );
}

function CostBadge({ costTier }: CostBadgeProps): ReactElement | null {
  const display = costTierDisplay(costTier);
  if (!display) {
    return null;
  }

  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
        display.colorClass,
      )}
      title={`Cost tier ${display.symbol}`}
    >
      {display.symbol}
    </span>
  );
}
