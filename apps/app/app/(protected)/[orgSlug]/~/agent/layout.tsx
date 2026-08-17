import type { ReactNode } from 'react';
import { AgentConversationRouteHost } from './AgentConversationRouteHost';

// The conversation lives in the layout so it survives `/agent/[id]` changes;
// the pages below only carry route intent (reset, malformed-id redirect).
export default function ChatLayout({ children }: { children: ReactNode }) {
  return <AgentConversationRouteHost>{children}</AgentConversationRouteHost>;
}
