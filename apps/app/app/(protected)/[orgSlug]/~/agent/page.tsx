'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { useLayoutEffect } from 'react';
import { ChatWorkspacePageShell } from '../chat/ChatWorkspacePageShell';

export default function AgentPage() {
  useLayoutEffect(() => {
    const { resetActiveConversationState, setActiveThread } =
      useAgentChatStore.getState();

    setActiveThread(null);
    resetActiveConversationState();
  }, []);

  return <ChatWorkspacePageShell />;
}
