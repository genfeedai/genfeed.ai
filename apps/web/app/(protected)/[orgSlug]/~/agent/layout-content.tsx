import type { ReactNode } from 'react';
import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';
import AgentConversationRouteHost from './AgentConversationRouteHost';

// The conversation lives in the layout so it survives `/agent/[id]` changes;
// the pages below only carry route intent (reset, malformed-id redirect).
// The full-page Agent app is a release item: while it is not released to the
// organization the route shows the hidden state. The agent sidebar is
// independent of it.
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <OrganizationModulePreferenceGate moduleId="agent">
      <AgentConversationRouteHost>{children}</AgentConversationRouteHost>
    </OrganizationModulePreferenceGate>
  );
}
