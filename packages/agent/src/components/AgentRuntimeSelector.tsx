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
  HiChevronDown,
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
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="gen-shell-control flex min-w-[11.75rem] items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-left"
          data-active={open ? 'true' : 'false'}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <RuntimeIcon
              category={selectedRuntime.category}
              provider={selectedRuntime.provider}
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/42">
                Runtime
              </p>
              <p className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
                {selectedRuntime.label}
              </p>
            </div>
          </div>
          <HiChevronDown
            className={cn(
              'h-3.5 w-3.5 text-foreground/42 transition-transform',
              open && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="gen-shell-panel w-[22rem] rounded-[1.25rem] p-2 text-foreground shadow-[0_28px_70px_-48px_rgba(0,0,0,0.9)]"
      >
        <div className="mb-2 flex items-start justify-between gap-3 px-2.5 py-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/42">
              Runtime Routing
            </p>
            <p className="text-xs text-foreground/58">
              {environmentLabel === 'local'
                ? 'Local CLI and hosted providers are both available'
                : 'Hosted runtimes only'}
            </p>
          </div>
          <span
            className="gen-shell-chip px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
            data-tone={environmentLabel === 'local' ? 'success' : 'info'}
          >
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
                className="gen-shell-surface flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
                data-active={isSelected ? 'true' : 'false'}
              >
                <RuntimeIcon
                  category={option.category}
                  provider={option.provider}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
                    {option.label}
                  </p>
                  <p className="truncate text-xs text-foreground/56">
                    {option.description}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>

        <div className="gen-shell-surface mt-3 rounded-2xl px-3 py-2.5">
          <p className="text-xs text-foreground/66">{providerSummary}</p>
          {environmentLabel === 'local' ? (
            <p className="mt-1 text-xs text-foreground/48">
              {localToolSummary}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
