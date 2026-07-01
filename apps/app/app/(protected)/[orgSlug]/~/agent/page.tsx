'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { useLayoutEffect } from 'react';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';

export default function AgentPage() {
  useLayoutEffect(() => {
    const { resetActiveConversationState, setActiveThread } =
      useAgentChatStore.getState();

    setActiveThread(null);
    resetActiveConversationState();
  }, []);

  return <AgentWorkspacePageShell />;
}
