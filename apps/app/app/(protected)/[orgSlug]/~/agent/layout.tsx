import FeatureGate from '@ui/guards/feature/FeatureGate';
import type { ReactNode } from 'react';
import { ChatWorkspaceLayoutClient } from '../chat/ChatWorkspaceLayoutClient';

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate flagKey="chat">
      <ChatWorkspaceLayoutClient>{children}</ChatWorkspaceLayoutClient>
    </FeatureGate>
  );
}
