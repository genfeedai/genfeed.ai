'use client';

import { useParams } from 'next/navigation';
import { AgentWorkspacePageShell } from '../AgentWorkspacePageShell';

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();

  return <AgentWorkspacePageShell threadId={params.id} />;
}
