'use client';

import {
  AgentThreadMessagesService,
  type ThreadMessage,
} from '@genfeedai/services/management/agent-thread-messages.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';

export const REVIEW_THREAD_MESSAGES_QUERY_KEY = 'review-thread-messages';

const NO_MESSAGES: ThreadMessage[] = [];

/** The conversation a review request opened, oldest message first. */
export function useReviewThreadMessages(threadId: string | undefined): {
  isLoading: boolean;
  messages: ThreadMessage[];
} {
  const query = useAuthedQuery<AgentThreadMessagesService, ThreadMessage[]>({
    enabled: Boolean(threadId),
    queryFn: (service, signal) => service.listMessages(threadId ?? '', signal),
    queryKey: [REVIEW_THREAD_MESSAGES_QUERY_KEY, threadId ?? null],
    service: (token: string) => AgentThreadMessagesService.getInstance(token),
  });

  return { isLoading: query.isLoading, messages: query.data ?? NO_MESSAGES };
}
