import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import Alert from '@ui/feedback/alert/Alert';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import { ArchiveRestore } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AgentArchivedComposerBarProps {
  layoutMode?: 'fixed' | 'surface-fixed';
  message?: string;
  onUnarchive: () => void | Promise<void>;
}

/**
 * Replaces the chat prompt bar when the open thread is archived.
 * Alert + Unarchive; parent flips isReadOnly off after a successful restore.
 */
export function AgentArchivedComposerBar({
  layoutMode = 'surface-fixed',
  message = 'This thread is archived. Unarchive it to continue the conversation.',
  onUnarchive,
}: AgentArchivedComposerBarProps): ReactElement {
  const composerShell = useConversationComposerShell();
  const isPortaled = Boolean(composerShell?.portalTarget);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnarchive = useCallback(async () => {
    if (isUnarchiving) {
      return;
    }
    setIsUnarchiving(true);
    setError(null);
    try {
      await onUnarchive();
    } catch {
      setError('Could not unarchive this thread. Try again.');
      setIsUnarchiving(false);
    }
  }, [isUnarchiving, onUnarchive]);

  const bar = (
    <PromptBarContainer
      className={cn(
        'w-full min-w-0 max-w-full',
        isPortaled && 'pointer-events-auto',
        layoutMode === 'fixed' && 'bottom-2 md:bottom-4',
        layoutMode === 'surface-fixed' && 'bottom-0',
      )}
      layoutMode={isPortaled ? 'inflow' : layoutMode}
      maxWidth={isPortaled ? 'full' : '4xl'}
      showTopFade={false}
      zIndex={40}
    >
      <div
        className={cn(
          'flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border',
          'bg-background-secondary/95 p-3 shadow-sm backdrop-blur-sm',
        )}
        data-testid="agent-archived-composer-bar"
      >
        <Alert
          type={AlertCategory.WARNING}
          className="border-0 bg-transparent p-0"
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="min-w-0 text-sm leading-5 text-foreground">
              {message}
            </p>
            <Button
              ariaLabel="Unarchive thread"
              className="shrink-0 self-start sm:self-center"
              icon={<ArchiveRestore className="size-4" />}
              isDisabled={isUnarchiving}
              isLoading={isUnarchiving}
              label="Unarchive"
              onClick={() => {
                void handleUnarchive();
              }}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          </div>
        </Alert>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </PromptBarContainer>
  );

  return composerShell?.portalTarget
    ? createPortal(bar, composerShell.portalTarget)
    : bar;
}
