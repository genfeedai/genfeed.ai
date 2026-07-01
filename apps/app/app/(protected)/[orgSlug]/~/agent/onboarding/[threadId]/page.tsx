'use client';

import { useParams } from 'next/navigation';
import { AgentWorkspacePageShell } from '../../AgentWorkspacePageShell';

export default function ChatOnboardingThreadPage() {
  const params = useParams<{ threadId: string }>();

  return <AgentWorkspacePageShell threadId={params.threadId} />;
}
