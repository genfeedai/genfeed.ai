'use client';

import type { AgentRuntimeOption } from '@genfeedai/agent/models/agent-runtime.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { PROMPT_BAR_CHIP_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  ChevronsUpDown,
  Monitor,
  Server,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { Fragment, type ReactElement } from 'react';

interface AgentRuntimeSelectorProps {
  environmentLabel: 'cloud' | 'local';
  localToolSummary: string;
  options: AgentRuntimeOption[];
  providerSummary: string;
  /** May be a local CLI that is not offered here (missing or outdated). */
  selectedRuntime: AgentRuntimeOption;
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

function runtimeLabel(option: AgentRuntimeOption): string {
  return option.category === 'auto' ? 'Default' : option.label;
}

export function AgentRuntimeSelector({
  options,
  selectedRuntime,
  onRuntimeChange,
}: AgentRuntimeSelectorProps): ReactElement {
  const groups = [
    {
      label: '',
      options: options.filter((option) => option.category === 'auto'),
    },
    {
      label: 'This computer',
      options: options.filter((option) => option.category === 'local'),
    },
    {
      label: 'Cloud',
      options: options.filter((option) => option.category === 'hosted'),
    },
  ].filter((group) => group.options.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={`Run with ${runtimeLabel(selectedRuntime)}`}
          className={PROMPT_BAR_CHIP_CLASS}
          size={ButtonSize.SM}
          textTransform="none"
          tooltip={selectedRuntime.hint ?? selectedRuntime.description}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <RuntimeIcon
            category={selectedRuntime.category}
            provider={selectedRuntime.provider}
          />
          <span className="min-w-0 truncate">
            {runtimeLabel(selectedRuntime)}
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuRadioGroup
          value={selectedRuntime.key}
          onValueChange={(key) => {
            const option = options.find((option) => option.key === key);
            if (option) onRuntimeChange(option);
          }}
        >
          {groups.map((group, index) => (
            <Fragment key={group.label}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              {group.label ? (
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              ) : null}
              {group.options.map((option) => (
                <DropdownMenuRadioItem
                  key={option.key || 'auto'}
                  value={option.key}
                  title={option.hint ?? option.description}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <RuntimeIcon
                      category={option.category}
                      provider={option.provider}
                    />
                    <span className="truncate">{runtimeLabel(option)}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
