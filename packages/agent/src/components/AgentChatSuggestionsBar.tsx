import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { type ReactElement, useMemo } from 'react';

interface AgentChatSuggestionsBarProps {
  suggestedActions: SuggestedAction[];
  isReadOnly: boolean;
  layout?: 'compact' | 'equal';
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
  isReadOnly,
  layout = 'compact',
  onSend,
}: AgentChatSuggestionsBarProps): ReactElement | null {
  const normalized = useMemo(() => {
    const next: Array<SuggestedAction & { id: string }> = [];
    for (let index = 0; index < suggestedActions.length; index += 1) {
      const action = suggestedActions[index];
      if (!action || isPlanModeSuggestion(action)) {
        continue;
      }
      next.push({
        ...action,
        id: action.id ?? `suggested-action-${index}-${action.label}`,
      });
    }
    return next;
  }, [suggestedActions]);

  if (normalized.length === 0) {
    return null;
  }

  // Short follow-up labels (e.g. post-analytics "Create a remix") are
  // one-liner chips — PostHog-style. Cards only when any item has a
  // multi-line description worth the taller tile.
  const hasDescriptions = normalized.some((action) =>
    Boolean(action.description?.trim()),
  );

  return (
    <PromptBarSuggestions
      suggestions={normalized}
      onSuggestionSelect={(action) => {
        // Full prompt is sent (or typed into the turn) — label stays short.
        onSend(action.prompt);
      }}
      isDisabled={isReadOnly}
      maxSuggestions={3}
      variant={hasDescriptions ? 'cards' : 'chips'}
      className={
        layout === 'equal' && !hasDescriptions
          ? 'grid grid-cols-1 sm:grid-cols-3 [&>button]:w-full [&>button]:max-w-none [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:shadow-none [&>button]:hover:bg-hover'
          : undefined
      }
    />
  );
}
