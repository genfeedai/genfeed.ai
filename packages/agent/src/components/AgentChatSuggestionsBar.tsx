import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import PromptBarSuggestions from '@ui/prompt-bars/components/suggestions/PromptBarSuggestions';
import { BotMessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo } from 'react';

interface AgentChatSuggestionsBarProps {
  suggestedActions: SuggestedAction[];
  isReadOnly: boolean;
  layout?: 'compact' | 'dock' | 'equal';
  onSend: (prompt: string) => void;
}

export function AgentChatSuggestionsBar({
  suggestedActions,
  isReadOnly,
  layout = 'compact',
  onSend,
}: AgentChatSuggestionsBarProps): ReactElement | null {
  const translate = useTranslations('agent.dock');
  // Plan is a reachable mode via the composer's mode dropdown (#4672) — a
  // "use Plan mode" suggestion is no longer blanket-suppressed.
  const normalized = useMemo(() => {
    const next: Array<SuggestedAction & { id: string }> = [];
    for (let index = 0; index < suggestedActions.length; index += 1) {
      const action = suggestedActions[index];
      if (!action) {
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

  if (layout === 'dock') {
    return (
      <div
        aria-label={translate('suggestionsAria')}
        className="grid w-full min-w-0 grid-cols-2 gap-2"
        role="toolbar"
      >
        {normalized.slice(0, 4).map((action) => (
          <Card
            key={action.id}
            bodyClassName="h-full p-3 [&>div]:flex-col [&>div]:gap-2"
            className="min-h-28 min-w-0 normal-case"
            description={action.description}
            icon={action.icon ?? <BotMessageSquare className="size-4" />}
            iconWrapperClassName="text-muted-foreground"
            isDisabled={isReadOnly}
            isLabelWrapped
            label={action.label}
            onClick={() => onSend(action.prompt)}
          />
        ))}
      </div>
    );
  }

  // Short follow-up labels (e.g. post-analytics "Create a remix") are
  // one-liner chips — PostHog-style. Cards only when any item has a
  // multi-line description worth the taller tile.
  const hasDescriptions = normalized.some((action) =>
    Boolean(action.description?.trim()),
  );

  // Columns follow the width of the column the chips sit in, not the
  // viewport: the agent + output layout puts them in a narrow left pane on a
  // wide screen, where viewport breakpoints squeezed four labels into "P...".
  return (
    <div className="@container w-full min-w-0">
      <PromptBarSuggestions
        suggestions={normalized}
        onSuggestionSelect={(action) => {
          // Full prompt is sent (or typed into the turn) — label stays short.
          onSend(action.prompt);
        }}
        isDisabled={isReadOnly}
        maxSuggestions={4}
        variant={hasDescriptions ? 'cards' : 'chips'}
        className={
          layout === 'equal' && !hasDescriptions
            ? cn(
                'grid grid-cols-1 [&>button]:w-full [&>button]:max-w-none',
                // A fourth tile (the leading "About this page" action) gets
                // its own column instead of orphaning onto a second row.
                normalized.length > 3
                  ? '@md:grid-cols-2 @3xl:grid-cols-4'
                  : '@xl:grid-cols-3',
              )
            : undefined
        }
      />
    </div>
  );
}
