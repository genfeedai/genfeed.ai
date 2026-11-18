'use client';

import type { ConversationComposerContextReference } from '@genfeedai/agent';
import { createContext, useContext, useEffect } from 'react';

export interface ResearchWorkspaceSurfaceAdapterRegistration {
  readonly references: readonly ConversationComposerContextReference[];
  readonly surfaceKey: 'discovery';
}

export type RegisterResearchWorkspaceSurfaceAdapter = (
  adapter: ResearchWorkspaceSurfaceAdapterRegistration,
) => () => void;

export const ResearchWorkspaceSurfaceAdapterRegistrationContext =
  createContext<RegisterResearchWorkspaceSurfaceAdapter | null>(null);

export function useRegisterResearchWorkspaceSurfaceAdapter(
  adapter: ResearchWorkspaceSurfaceAdapterRegistration,
): void {
  const register = useContext(
    ResearchWorkspaceSurfaceAdapterRegistrationContext,
  );

  // use-effect-audit: ignore registers the adapter with the work surface
  useEffect(() => {
    if (!register) {
      return;
    }

    return register(adapter);
  }, [adapter, register]);
}

export function useResearchWorkspaceSurfaceAdapterRegistrationAvailable(): boolean {
  return (
    useContext(ResearchWorkspaceSurfaceAdapterRegistrationContext) !== null
  );
}
