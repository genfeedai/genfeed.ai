'use client';

import { useParams } from 'next/navigation';
import { ChatWorkspacePageShell } from '../../ChatWorkspacePageShell';

export default function ChatOnboardingThreadPage() {
  const params = useParams<{ threadId: string }>();

  return <ChatWorkspacePageShell threadId={params.threadId} />;
}
