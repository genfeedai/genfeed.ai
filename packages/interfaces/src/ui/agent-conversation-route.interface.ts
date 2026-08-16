/**
 * Which conversation surface an `/agent/*` pathname resolves to, as seen from
 * the persistent agent layout. Non-conversation routes (`/agent/journey`)
 * resolve to `null` so the layout renders the page's own content instead.
 */
export interface AgentConversationRoute {
  isOnboarding: boolean;
  threadId?: string;
}
