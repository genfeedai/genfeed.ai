'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { useLayoutEffect } from 'react';

// The conversation shell is hosted by the agent layout
// (AgentConversationRouteHost); this page only clears the active thread.
export default function ChatNewPage() {
  useLayoutEffect(() => {
    const { resetActiveConversationState, setActiveThread } =
      useAgentChatStore.getState();

    setActiveThread(null);
    resetActiveConversationState();
  }, []);

  return null;
}
