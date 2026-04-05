import FeatureGate from '@ui/guards/feature/FeatureGate';
import type { ReactNode } from 'react';
import { ChatWorkspaceLayoutClient } from './ChatWorkspaceLayoutClient';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate flagKey="chat">
      <ChatWorkspaceLayoutClient>{children}</ChatWorkspaceLayoutClient>
    </FeatureGate>
  );
}
