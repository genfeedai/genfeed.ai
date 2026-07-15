'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type ConversationComposerContextReference,
  useAgentChatStore,
} from '@genfeedai/agent';
import type { ScopedResearchFindingReference } from '@genfeedai/interfaces';
import ResearchFindingInspector from '@pages/research/work-surface/ResearchFindingInspector';
import { useOptionalResearchWorkSurface } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import {
  type ResearchWorkspaceSurfaceAdapterRegistration,
  useRegisterResearchWorkspaceSurfaceAdapter,
  useResearchWorkspaceSurfaceAdapterRegistrationAvailable,
} from '@/features/research/work-surface/research-workspace-surface-adapter-context';

export default function ResearchWorkspaceSurfaceAdapter() {
  const surface = useOptionalResearchWorkSurface();
  const { brandId, organizationId } = useBrand();
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((state) => state.setPageContext);
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
  const researchReferences = useMemo<readonly ScopedResearchFindingReference[]>(
    () =>
      surface?.authorizedFinding && brandId && organizationId
        ? [
            {
              ...surface.authorizedFinding.reference,
              brandId,
              organizationId,
            },
          ]
        : [],
    [brandId, organizationId, surface?.authorizedFinding],
  );

  useEffect(() => {
    const currentContext = useAgentChatStore.getState().pageContext;
    setPageContext({
      ...(currentContext?.route === pathname ? currentContext : {}),
      researchReferences:
        researchReferences.length > 0 ? [...researchReferences] : undefined,
      route: pathname,
      suggestedActions: currentContext?.suggestedActions ?? [],
    });

    return () => {
      const latestContext = useAgentChatStore.getState().pageContext;
      if (latestContext?.route !== pathname) {
        return;
      }

      const { researchReferences: _researchReferences, ...rest } =
        latestContext;
      setPageContext(rest);
    };
  }, [pathname, researchReferences, setPageContext]);

  const adapter = useMemo<ResearchWorkspaceSurfaceAdapterRegistration>(
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
