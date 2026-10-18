import type { ReviewInboxItemSource } from '@genfeedai/contracts/interfaces';

export const REVIEW_INBOX_SOURCES: readonly ReviewInboxItemSource[] = [
  'agent',
  'workflow',
  'mcp_client',
];

/** `pages.publishing.review.inbox` keys naming each source. */
export const REVIEW_INBOX_SOURCE_MESSAGE_KEYS: Record<
  ReviewInboxItemSource,
  'sources.agent' | 'sources.workflow' | 'sources.mcpClient'
> = {
  agent: 'sources.agent',
  mcp_client: 'sources.mcpClient',
  workflow: 'sources.workflow',
};
