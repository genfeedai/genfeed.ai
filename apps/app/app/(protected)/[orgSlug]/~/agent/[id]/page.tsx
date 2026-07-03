'use client';

import { isRenderableThreadId } from '@genfeedai/agent';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AgentWorkspacePageShell } from '../AgentWorkspacePageShell';

export default function ChatThreadPage() {
  const params = useParams<{ id: string; orgSlug: string }>();
  const { replace } = useRouter();
  const isValidThreadId = isRenderableThreadId(params.id);

  // Malformed ids (e.g. /agent/undefined from a stale link) never reach the
  // thread shell — recover to the agent root instead of fetching
  // /threads/undefined/*.
  useEffect(() => {
    if (!isValidThreadId) {
      replace(`/${params.orgSlug}/~/agent`);
    }
  }, [isValidThreadId, params.orgSlug, replace]);

  if (!isValidThreadId) {
    return null;
  }

  return <AgentWorkspacePageShell threadId={params.id} />;
}
