import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { type ReactElement, useMemo } from 'react';

interface AgentChatSuggestionsBarProps {
  suggestedActions: SuggestedAction[];
  isBusy: boolean;
  isReadOnly: boolean;
  onSend: (prompt: string) => void;
}

function isPlanModeSuggestion(action: SuggestedAction): boolean {
  return (
    action.prompt.trim().toLowerCase() === 'use plan mode in this thread' ||
    action.label.trim().toLowerCase() === 'use plan mode'
  );
}

export function AgentChatSuggestionsBar({
  suggestedActions,
  isBusy,
  isReadOnly,
  onSend,
}: AgentChatSuggestionsBarProps): ReactElement | null {
  const normalized = useMemo(
    () =>
      suggestedActions
        .filter((action) => !isPlanModeSuggestion(action))
        .map((action, index) => ({
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
        onSend(action.prompt);
      }}
      isDisabled={isBusy || isReadOnly}
      maxSuggestions={3}
      className="justify-center"
    />
  );
}
