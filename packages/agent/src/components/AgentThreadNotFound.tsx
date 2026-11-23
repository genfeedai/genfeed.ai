import NotFoundState from '@ui/feedback/NotFoundState';
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
    <NotFoundState
      backLinkHref={newChatHref}
      backLinkLabel={translate('startNewChat')}
      data-testid="agent-thread-not-found"
      message={translate('description')}
      role="alert"
      title={translate('title')}
    />
  );
}
