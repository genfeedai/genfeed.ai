import { useAgentChatStore } from '@genfeedai/agent';
import type { MessagesSurfaceAdapterParams } from '@props/messages/messages-surface-adapter.props';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import {
  useRegisterWorkspaceSurfacePresentationAdapter,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

export function useMessagesSurfaceAdapter({
  references,
}: MessagesSurfaceAdapterParams): void {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((state) => state.setPageContext);
  const adapter = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({
      contextLabel:
        references.length > 0
          ? `Canvas · Messages · ${references.length} social ${references.length === 1 ? 'reference' : 'references'}`
          : 'Canvas · Messages',
      surfaceKey: 'messages',
    }),
    [references.length],
  );

  useRegisterWorkspaceSurfacePresentationAdapter(adapter);

  useEffect(() => {
    const current = useAgentChatStore.getState().pageContext;
    setPageContext({
      ...current,
      placeholder: 'Ask for help with the selected social conversation...',
      route: pathname,
      socialReferences: references.length > 0 ? [...references] : undefined,
      suggestedActions: current?.suggestedActions ?? [],
    });

    return () => {
      const latest = useAgentChatStore.getState().pageContext;
      if (latest?.route !== pathname) {
        return;
      }

      setPageContext({
        ...latest,
        socialReferences: undefined,
      });
    };
  }, [pathname, references, setPageContext]);
}
