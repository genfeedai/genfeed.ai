'use client';

import { useParams } from 'next/navigation';
import { ChatWorkspacePageShell } from '../../chat/ChatWorkspacePageShell';

export default function AgentThreadPage() {
  const params = useParams<{ id: string }>();

  return <ChatWorkspacePageShell threadId={params.id} />;
}
