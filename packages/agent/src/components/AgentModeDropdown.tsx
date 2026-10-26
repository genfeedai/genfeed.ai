'use client';

import {
  AgentThreadMode,
  ButtonSize,
  ButtonVariant,
  normalizeAgentThreadMode,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  PROMPT_BAR_CHIP_CLASS,
  PROMPT_BAR_CHIP_FIT_CLASS,
  PROMPT_BAR_CHIP_LABEL_CLASS,
} from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { keepFocusOnSwitch } from '@ui/prompt-bars/base/keep-focus-on-switch';
import { ChevronDown, Hand, ListChecks, Sparkles } from 'lucide-react';
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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={triggerLabel}
          className={cn(
            PROMPT_BAR_CHIP_CLASS,
            PROMPT_BAR_CHIP_FIT_CLASS,
            className,
          )}
          icon={active.icon}
          isDisabled={isDisabled}
          size={ButtonSize.SM}
          textTransform="none"
          tooltip={triggerLabel}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span className={PROMPT_BAR_CHIP_LABEL_CLASS}>{active.label}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3 text-muted-foreground',
              PROMPT_BAR_CHIP_LABEL_CLASS,
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72"
        onCloseAutoFocus={keepFocusOnSwitch}
        side="top"
        sideOffset={8}
      >
        <DropdownMenuLabel className="text-xs normal-case tracking-normal text-foreground">
          {translate('title')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onChange(normalizeAgentThreadMode(value))}
          value={mode}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="text-muted-foreground">{option.icon}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-xs normal-case">
                  {option.label}
                </span>
                <span className="text-2xs normal-case leading-4 text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
