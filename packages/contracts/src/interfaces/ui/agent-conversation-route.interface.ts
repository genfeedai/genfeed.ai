/**
 * Which conversation surface an `/agent/*` pathname resolves to, as seen from
 * the persistent agent layout. Non-conversation routes (`/agent/journey`)
 * resolve to `null` so the layout renders the page's own content instead.
 *
 * - `master`: the master conversation on the left, the Threads list or one
 *   open thread (`threadId`) on the right (`/agent`, `/agent/threads`,
 *   `/agent/:threadId`).
 * - `single`: one full-width conversation (`/agent/new`, and a thread opened
 *   full size at `/agent/:threadId/full`).
 */
export interface AgentConversationRoute {
  layout: 'master' | 'single';
  threadId?: string;
}
