'use client';

import type { ConversationComposerContextReference } from '@genfeedai/agent';
import { createContext, type ReactNode, useContext, useEffect } from 'react';

export interface ResearchWorkspaceSurfaceAdapterRegistration {
  readonly inspectorContent: ReactNode;
  readonly references: readonly ConversationComposerContextReference[];
  readonly surfaceKey: 'research';
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
