'use client';

import { AgentThreadUpdateNotice } from '@genfeedai/agent/components/AgentThreadUpdateNotice';
import { isThreadGoneError } from '@genfeedai/agent/components/agent-thread-list.helpers';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
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
  const [isMissingThread, setIsMissingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnarchive = useCallback(async () => {
    if (isUnarchiving) {
      return;
    }
    setIsUnarchiving(true);
    setError(null);
    setIsMissingThread(false);
    try {
      await onUnarchive();
    } catch (error) {
      if (isThreadGoneError(error)) setIsMissingThread(true);
      else setError('Could not unarchive this thread. Try again.');
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
      zIndex={40}
    >
      <PromptBarComposer
        bodyClassName="flex min-w-0 flex-col gap-2"
        data-testid="agent-archived-composer-bar"
      >
        <Alert variant="warning">
          <AlertDescription>{message}</AlertDescription>
          <AlertActions>
            <Button
              ariaLabel="Unarchive thread"
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
          </AlertActions>
        </Alert>
        <AgentThreadUpdateNotice
          failure={isMissingThread ? 'missing-thread' : null}
        />
        {error ? (
          <Alert size="sm" variant="destructive">
            {error}
          </Alert>
        ) : null}
      </PromptBarComposer>
    </PromptBarContainer>
  );

  return composerShell?.portalTarget
    ? createPortal(bar, composerShell.portalTarget)
    : bar;
}
