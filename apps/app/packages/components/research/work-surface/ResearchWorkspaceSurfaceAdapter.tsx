'use client';

import type { ConversationComposerContextReference } from '@genfeedai/agent';
import ResearchFindingInspector from '@pages/research/work-surface/ResearchFindingInspector';
import { useOptionalResearchWorkSurface } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import { useEffect, useMemo } from 'react';
import {
  useRegisterResearchWorkspaceSurfaceAdapter,
  useResearchWorkspaceSurfaceAdapterRegistrationAvailable,
} from '@/features/research/work-surface/research-workspace-surface-adapter-context';

export default function ResearchWorkspaceSurfaceAdapter() {
  const surface = useOptionalResearchWorkSurface();
  const isRegistrationAvailable =
    useResearchWorkspaceSurfaceAdapterRegistrationAvailable();
  useEffect(() => {
    surface?.setEmbedded(isRegistrationAvailable);
  }, [isRegistrationAvailable, surface?.setEmbedded]);
  const references = useMemo<readonly ConversationComposerContextReference[]>(
    () =>
      surface?.authorizedFinding
        ? [
            {
              authorization: 'authorized',
              id: surface.authorizedFinding.reference.id,
              kind: surface.authorizedFinding.reference.kind,
              label: surface.authorizedFinding.title,
            },
          ]
        : [],
    [surface?.authorizedFinding],
  );
  const adapter = useMemo(
    () => ({
      inspectorContent: <ResearchFindingInspector />,
      references,
      surfaceKey: 'research',
    }),
    [references],
  );

  useRegisterResearchWorkspaceSurfaceAdapter(adapter);
  return null;
}
