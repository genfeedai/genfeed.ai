'use client';

import { useParams } from 'next/navigation';
import { ChatWorkspacePageShell } from '../ChatWorkspacePageShell';

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();

  return <ChatWorkspacePageShell threadId={params.id} />;
}
