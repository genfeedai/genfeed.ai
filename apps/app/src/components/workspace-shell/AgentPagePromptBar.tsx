'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { AgentDockSuggestedAction } from '@props/ui/agent-dock.props';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

type AgentPagePromptBarProps = {
  readonly onOpen: () => void;
  readonly onSelectSuggestedAction?: (prompt: string) => void;
  readonly placeholder?: string;
  readonly suggestedActions?: readonly AgentDockSuggestedAction[];
};

export default function AgentPagePromptBar({
  onOpen,
  onSelectSuggestedAction,
  placeholder,
  suggestedActions = [],
}: AgentPagePromptBarProps) {
  const translate = useTranslations('common.agentDock');
  const resolvedPlaceholder = placeholder?.trim() || translate('pagePrompt');
  const suggestions = useMemo(
    () =>
      suggestedActions.map((action, index) => ({
        id: action.id ?? `page-prompt-${index}-${action.label}`,
        label: action.label,
        prompt: action.prompt,
      })),
    [suggestedActions],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3 sm:px-4">
      <div className="pointer-events-auto w-full min-w-0 max-w-3xl">
        {suggestions.length > 0 ? (
          <div className="pb-3">
            <PromptBarSuggestions
              onSuggestionSelect={(action) => {
                onSelectSuggestedAction?.(action.prompt);
              }}
              suggestions={suggestions}
              variant="chips"
            />
          </div>
        ) : null}
        <PromptBarComposer density="compact">
          <Button
            ariaLabel={resolvedPlaceholder}
            className="flex min-h-11 w-full items-center px-1 text-left text-sm text-muted-foreground"
            data-testid="agent-page-promptbar"
            onClick={onOpen}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {resolvedPlaceholder}
          </Button>
        </PromptBarComposer>
      </div>
    </div>
  );
}
