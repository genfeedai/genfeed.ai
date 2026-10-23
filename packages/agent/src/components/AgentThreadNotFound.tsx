import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

interface AgentThreadNotFoundProps {
  /** Where "Start a new chat" goes; the action is hidden when the host omits it. */
  newChatHref?: string;
}

/**
 * The thread in the URL does not exist, or was deleted. Shown in place of the
 * conversation so an unknown id never reads as a fresh "Start a chat" empty
 * state that would silently send the user's first message into a new thread.
 */
export function AgentThreadNotFound({
  newChatHref,
}: AgentThreadNotFoundProps): ReactElement {
  const translate = useTranslations('agent.fullPage.threadNotFound');

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
      data-testid="agent-thread-not-found"
      role="alert"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          {translate('title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translate('description')}
        </p>
      </div>
      {newChatHref ? (
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Link href={newChatHref}>{translate('startNewChat')}</Link>
        </Button>
      ) : null}
    </div>
  );
}
