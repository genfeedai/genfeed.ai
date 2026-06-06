import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { type ReactElement, useMemo } from 'react';

interface AgentChatSuggestionsBarProps {
  suggestedActions: SuggestedAction[];
  isBusy: boolean;
  isReadOnly: boolean;
  onPlanModeToggle: () => void;
  onSend: (prompt: string) => void;
}

export function AgentChatSuggestionsBar({
  suggestedActions,
  isBusy,
  isReadOnly,
  onPlanModeToggle,
  onSend,
}: AgentChatSuggestionsBarProps): ReactElement | null {
  const normalized = useMemo(
    () =>
      suggestedActions.map((action, index) => ({
        ...action,
        id: action.id ?? `suggested-action-${index}-${action.label}`,
      })),
    [suggestedActions],
  );

  if (normalized.length === 0) {
    return null;
  }

  return (
    <PromptBarSuggestions
      suggestions={normalized}
      onSuggestionSelect={(action) => {
        const normalizedPrompt = action.prompt.trim().toLowerCase();
        const normalizedLabel = action.label.trim().toLowerCase();

        if (
          normalizedPrompt === 'use plan mode in this thread' ||
          normalizedLabel === 'use plan mode'
        ) {
          onPlanModeToggle();
          return;
        }

        onSend(action.prompt);
      }}
      isDisabled={isBusy || isReadOnly}
      maxSuggestions={normalized.length}
      className="justify-center"
    />
  );
}
