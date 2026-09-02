import { AgentGeneratedTextCard } from '@genfeedai/agent/components/AgentGeneratedTextCard';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Check, FileText } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';

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
      <div className="my-2 border border-success/20 bg-success/10 p-4  ">
        <div className="flex items-center gap-2 text-success ">
          <Check className="size-5" />
          <span className="text-sm font-medium">
            &quot;{selectedAction}&quot; applied
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="size-5 text-sky-500" />
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
        <p className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
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
        className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-black"
      >
        Apply
      </Button>
    </div>
  );
}
