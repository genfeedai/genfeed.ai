'use client';

import type { AgentRuntimeOption } from '@genfeedai/agent/models/agent-runtime.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  ChevronsUpDown,
  Monitor,
  Server,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

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
    return <Terminal className="size-3.5 text-success" />;
  }

  if (provider === 'replicate') {
    return <Monitor className="size-3.5 text-info" />;
  }

  if (provider === 'openrouter') {
    return <Server className="size-3.5 text-warning" />;
  }

  if (category === 'auto') {
    return <Zap className="size-3.5 text-primary" />;
  }

  return <Sparkles className="size-3.5 text-primary" />;
}

export function AgentRuntimeSelector({
  environmentLabel,
  localToolSummary,
  options,
  providerSummary,
  selectedRuntimeKey,
  onRuntimeChange,
}: AgentRuntimeSelectorProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const selectedRuntime = useMemo(
    () =>
      options.find((option) => option.key === selectedRuntimeKey) ?? options[0],
    [options, selectedRuntimeKey],
  );

  if (!selectedRuntime) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="gen-shell-control flex items-center gap-1.5 rounded-md px-2 py-1 text-left"
          data-active={open ? 'true' : 'false'}
        >
          <span className="sr-only">Runtime</span>
          <RuntimeIcon
            category={selectedRuntime.category}
            provider={selectedRuntime.provider}
          />
          <span className="text-2xs font-medium text-foreground">
            {selectedRuntime.label}
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="w-[22rem] rounded-md p-2"
      >
        <div className="mb-2 flex items-start justify-between gap-3 px-2.5 py-2">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-foreground/42">
              Runtime Routing
            </p>
            <p className="text-xs text-foreground/58">
              {environmentLabel === 'local'
                ? 'Local CLI and hosted providers are both available'
                : 'Hosted runtimes only'}
            </p>
          </div>
          <span
            className="gen-shell-chip px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.16em]"
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
                className="gen-shell-surface flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors"
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
