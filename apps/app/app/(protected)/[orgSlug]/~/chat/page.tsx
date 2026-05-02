'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { useLayoutEffect } from 'react';
import { ChatWorkspacePageShell } from './ChatWorkspacePageShell';

export default function ChatPage() {
  useLayoutEffect(() => {
    const { resetActiveConversationState, setActiveThread } =
      useAgentChatStore.getState();

    setActiveThread(null);
    resetActiveConversationState();
  }, []);

  return <ChatWorkspacePageShell />;
}
