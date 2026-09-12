'use client';

import {
  type AgentThreadMode,
  ButtonSize,
  ButtonVariant,
  normalizeAgentThreadMode,
} from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Hand, ListChecks, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, type ReactNode, useMemo } from 'react';

interface AgentModeDropdownProps {
  className?: string;
  isDisabled?: boolean;
  mode: AgentThreadMode;
  onChange: (mode: AgentThreadMode) => void;
}

interface AgentModeOption {
  description: string;
  icon: ReactNode;
  label: string;
  value: AgentThreadMode;
}

/**
 * Single prompt-bar control for the Agent's mode (#4672) — replaces the old
 * Type/Agent-pick/Brand-voice/Prompt-enhance setup popover. Shows the active
 * thread's mode (or the draft mode for a not-yet-created thread) and PATCHes
 * both the thread and the user's saved default on selection (see
 * `setAgentMode` in `use-agent-chat-container.ts`).
 */
export function AgentModeDropdown({
  className,
  isDisabled,
  mode,
  onChange,
}: AgentModeDropdownProps): ReactElement {
  const translate = useTranslations('agent.modeDropdown');
  const options = useMemo<readonly AgentModeOption[]>(
    () => [
      {
        description: translate('auto.description'),
        icon: <Sparkles className="size-4" />,
        label: translate('auto.label'),
        value: AgentThreadMode.AUTO,
      },
      {
        description: translate('manual.description'),
        icon: <Hand className="size-4" />,
        label: translate('manual.label'),
        value: AgentThreadMode.MANUAL,
      },
      {
        description: translate('plan.description'),
        icon: <ListChecks className="size-4" />,
        label: translate('plan.label'),
        value: AgentThreadMode.PLAN,
      },
    ],
    [translate],
  );
  const active = useMemo(
    () => options.find((option) => option.value === mode) ?? options[1],
    [mode, options],
  );
  const triggerLabel = translate('triggerAria', { mode: active.label });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={triggerLabel}
          className={className}
          icon={active.icon}
          isDisabled={isDisabled}
          size={ButtonSize.ICON}
          tooltip={triggerLabel}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5 normal-case tracking-normal">
          <span className="text-xs font-semibold text-foreground">
            {translate('title')}
          </span>
          <span className="text-2xs font-normal leading-4 text-muted-foreground">
            {translate('subtitle')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onChange(normalizeAgentThreadMode(value))}
          value={mode}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-muted-foreground">{option.icon}</span>
                <span className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {option.label}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {option.description}
                  </p>
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
