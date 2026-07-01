import FeatureGate from '@ui/guards/feature/FeatureGate';
import type { ReactNode } from 'react';
import { AgentWorkspaceLayoutClient } from './AgentWorkspaceLayoutClient';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate flagKey="agent">
      <AgentWorkspaceLayoutClient>{children}</AgentWorkspaceLayoutClient>
    </FeatureGate>
  );
}
