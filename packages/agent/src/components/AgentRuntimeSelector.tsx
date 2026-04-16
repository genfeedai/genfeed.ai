'use client';

import type { AgentRuntimeOption } from '@genfeedai/agent/models/agent-runtime.model';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { type ReactElement, useMemo, useState } from 'react';
import {
  HiChevronUp,
  HiCommandLine,
  HiComputerDesktop,
  HiOutlineBolt,
  HiOutlineSparkles,
  HiServerStack,
} from 'react-icons/hi2';

interface AgentRuntimeSelectorProps {
  environmentLabel: 'cloud' | 'local';
  localToolSummary: string;
  options: AgentRuntimeOption[];
  providerSummary: string;
  selectedRuntimeKey: string;
  onRuntimeChange: (runtime: AgentRuntimeOption) => void;
}

function RuntimeIcon({
  category,
  provider,
}: Pick<AgentRuntimeOption, 'category' | 'provider'>): ReactElement {
  if (category === 'local') {
    return <HiCommandLine className="h-3.5 w-3.5 text-emerald-300" />;
  }

  if (provider === 'replicate') {
    return <HiComputerDesktop className="h-3.5 w-3.5 text-sky-300" />;
  }

  if (provider === 'openrouter') {
    return <HiServerStack className="h-3.5 w-3.5 text-amber-300" />;
  }

  if (category === 'auto') {
    return <HiOutlineBolt className="h-3.5 w-3.5 text-primary" />;
  }

  return <HiOutlineSparkles className="h-3.5 w-3.5 text-violet-300" />;
}

export function AgentRuntimeSelector({
  environmentLabel,
  localToolSummary,
  options,
  providerSummary,
  selectedRuntimeKey,
  onRuntimeChange,
}: AgentRuntimeSelectorProps): ReactElement {
  const [open, setOpen] = useState(false);
  const selectedRuntime = useMemo(
    () =>
      options.find((option) => option.key === selectedRuntimeKey) ?? options[0],
    [options, selectedRuntimeKey],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          className="flex min-w-[11rem] items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.06]"
        >
          <div className="flex min-w-0 items-center gap-2">
            <RuntimeIcon
              category={selectedRuntime.category}
              provider={selectedRuntime.provider}
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                Runtime
              </p>
              <p className="truncate text-sm font-medium text-foreground">
                {selectedRuntime.label}
              </p>
            </div>
          </div>
          <HiChevronUp
            className={cn(
              'h-3.5 w-3.5 text-foreground/40 transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[22rem] border border-white/[0.08] bg-[#0b1020]/96 p-2 text-white shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-2 flex items-center justify-between px-2 py-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
              Terminal Picker
            </p>
            <p className="text-xs text-white/60">
              {environmentLabel === 'local'
                ? 'Local machine capabilities detected'
                : 'Hosted runtimes only'}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
            {environmentLabel}
          </span>
        </div>

        <div className="space-y-1">
          {options.map((option) => {
            const isSelected = option.key === selectedRuntime.key;

            return (
              <Button
                key={option.key || 'auto'}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => {
                  onRuntimeChange(option);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.05]',
                )}
              >
                <RuntimeIcon
                  category={option.category}
                  provider={option.provider}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {option.label}
                  </p>
                  <p className="truncate text-xs text-white/55">
                    {option.description}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
          <p className="text-xs text-white/65">{providerSummary}</p>
          {environmentLabel === 'local' ? (
            <p className="mt-1 text-xs text-white/45">{localToolSummary}</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
