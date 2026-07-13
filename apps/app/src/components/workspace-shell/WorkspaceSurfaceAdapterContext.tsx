'use client';

import type { AgentArtifactReference } from '@genfeedai/interfaces';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';

export interface WorkspaceSurfaceComposerReference {
  label: string;
  reference: AgentArtifactReference;
}

export interface WorkspaceSurfaceAdapterRegistration {
  contextLabel: string;
  references: readonly WorkspaceSurfaceComposerReference[];
  renderInspector: () => ReactNode;
  scope: {
    brandId?: string;
    organizationId: string;
  };
  surfaceKey: string;
}

type WorkspaceSurfaceAdapterRegistrar = (
  registration: WorkspaceSurfaceAdapterRegistration,
) => () => void;

const WorkspaceSurfaceAdapterRegistrationContext =
  createContext<WorkspaceSurfaceAdapterRegistration | null>(null);
const WorkspaceSurfaceAdapterRegistrarContext =
  createContext<WorkspaceSurfaceAdapterRegistrar | null>(null);

export function WorkspaceSurfaceAdapterProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [registration, setRegistration] =
    useState<WorkspaceSurfaceAdapterRegistration | null>(null);
  const register = useCallback(
    (nextRegistration: WorkspaceSurfaceAdapterRegistration) => {
      setRegistration(nextRegistration);

      return () => {
        setRegistration((current) =>
          current === nextRegistration ? null : current,
        );
      };
    },
    [],
  );
  return (
    <WorkspaceSurfaceAdapterRegistrarContext.Provider value={register}>
      <WorkspaceSurfaceAdapterRegistrationContext.Provider value={registration}>
        {children}
      </WorkspaceSurfaceAdapterRegistrationContext.Provider>
    </WorkspaceSurfaceAdapterRegistrarContext.Provider>
  );
}

export function useWorkspaceSurfaceAdapter(): WorkspaceSurfaceAdapterRegistration | null {
  return useContext(WorkspaceSurfaceAdapterRegistrationContext);
}

/**
 * Product routes register only while mounted inside the universal shell. In the
 * legacy routed experience the hook intentionally becomes a no-op.
 */
export function useRegisterWorkspaceSurfaceAdapter(
  registration: WorkspaceSurfaceAdapterRegistration,
): void {
  const register = useContext(WorkspaceSurfaceAdapterRegistrarContext);

  useLayoutEffect(() => {
    if (!register) {
      return;
    }

    return register(registration);
  }, [register, registration]);
}
