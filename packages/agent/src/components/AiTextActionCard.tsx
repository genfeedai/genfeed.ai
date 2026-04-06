import { AgentGeneratedTextCard } from '@genfeedai/agent/components/AgentGeneratedTextCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { type ReactElement, useCallback, useState } from 'react';
import { HiCheck, HiDocumentText } from 'react-icons/hi2';

interface AiTextActionCardProps {
  action: AgentUiAction;
  onApply?: (payload: { text: string; selectedAction: string }) => void;
}

const DEFAULT_ACTIONS = [
  'Enhance',
  'Rewrite',
  'Shorten',
  'Expand',
  'Translate',
];

export function AiTextActionCard({
  action,
  onApply,
}: AiTextActionCardProps): ReactElement {
  const textContent = action.textContent ?? '';
  const availableActions = action.textActions ?? DEFAULT_ACTIONS;
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [isApplied, setIsApplied] = useState(false);

  const handleApply = useCallback(() => {
    if (!selectedAction) {
      return;
    }
    onApply?.({ selectedAction, text: textContent });
    setIsApplied(true);
  }, [selectedAction, textContent, onApply]);
  const handleCopyText = useCallback(async () => {
    if (!textContent || typeof navigator === 'undefined') {
      return;
    }

    try {
      await navigator.clipboard.writeText(textContent);
    } catch {
      // no-op: failure to copy should not block text actions
    }
  }, [textContent]);

  if (isApplied) {
    return (
      <div className="my-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">
            &quot;{selectedAction}&quot; applied
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiDocumentText className="h-5 w-5 text-sky-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Text Actions'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Text preview */}
      {textContent && (
        <AgentGeneratedTextCard
          title="Current Text"
          content={textContent}
          onCopy={handleCopyText}
          className="mb-3"
          contentClassName="max-h-32 overflow-y-auto"
        />
      )}

      {/* Action pills */}
      <div className="mb-3">
        <p className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Choose action
        </p>
        <div className="flex flex-wrap gap-1.5">
          {availableActions.map((actionLabel) => (
            <Button
              key={actionLabel}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => setSelectedAction(actionLabel)}
              className={`rounded-full border px-3 py-1 text-xs font-black transition-colors ${
                selectedAction === actionLabel
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {actionLabel}
            </Button>
          ))}
        </div>
      </div>

      {/* Apply button */}
      <Button
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
        onClick={handleApply}
        isDisabled={!selectedAction}
        className="flex w-full items-center justify-center gap-2 rounded px-4 py-2 text-sm font-black"
      >
        Apply
      </Button>
    </div>
  );
}
