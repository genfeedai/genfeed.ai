'use client';

import {
  AgentThreadMode,
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

const AGENT_MODE_OPTIONS: readonly AgentModeOption[] = [
  {
    description:
      'Generates, writes brand context, and runs gated actions without asking. Sending to people or publishing still confirms.',
    icon: <Sparkles className="size-4" />,
    label: 'Auto',
    value: AgentThreadMode.AUTO,
  },
  {
    description:
      'Asks before spending credits, writing brand context, or running a gated action.',
    icon: <Hand className="size-4" />,
    label: 'Manual',
    value: AgentThreadMode.MANUAL,
  },
  {
    description:
      'Drafts a plan with a credit estimate and runs it only after you approve.',
    icon: <ListChecks className="size-4" />,
    label: 'Plan',
    value: AgentThreadMode.PLAN,
  },
];

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
  const active = useMemo(
    () =>
      AGENT_MODE_OPTIONS.find((option) => option.value === mode) ??
      AGENT_MODE_OPTIONS[1],
    [mode],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={`Agent mode: ${active.label}`}
          className={className}
          icon={active.icon}
          isDisabled={isDisabled}
          size={ButtonSize.ICON}
          tooltip={`Agent mode: ${active.label}`}
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
            Agent mode
          </span>
          <span className="text-2xs font-normal leading-4 text-muted-foreground">
            Controls what the Agent asks before doing.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onChange(normalizeAgentThreadMode(value))}
          value={mode}
        >
          {AGENT_MODE_OPTIONS.map((option) => (
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
