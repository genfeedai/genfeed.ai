'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  AgentArtifactRecordKind,
  AgentArtifactReference,
} from '@genfeedai/interfaces';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

export interface WorkspaceSurfaceAdapterRegistration {
  readonly canonicalFallback: 'same-route';
  readonly description: string;
  readonly key: string;
  readonly managementMode: 'canonical-route';
  readonly scope: 'brand' | 'organization';
  readonly supportedReferenceKinds: readonly AgentArtifactRecordKind[];
  readonly title: string;
}

export interface ActiveWorkspaceSurfaceAdapter {
  readonly artifactReferences: readonly AgentArtifactReference[];
  readonly brandId?: string;
  readonly organizationId: string;
  readonly registration: WorkspaceSurfaceAdapterRegistration;
}

export interface WorkspaceSurfaceComposerReference {
  readonly label: string;
  readonly reference: AgentArtifactReference;
}

export interface ProductWorkspaceSurfaceAdapter {
  readonly contextLabel: string;
  readonly references: readonly WorkspaceSurfaceComposerReference[];
  readonly renderInspector: () => ReactNode;
  readonly scope: {
    readonly brandId?: string;
    readonly organizationId: string;
  };
  readonly surfaceKey: string;
}

type ProductWorkspaceSurfaceAdapterRegistrar = (
  registration: ProductWorkspaceSurfaceAdapter,
) => () => void;

interface WorkspaceSurfaceAdapterContextValue {
  readonly activeAdapter: ActiveWorkspaceSurfaceAdapter | null;
  readonly activateAdapter: (
    registration: WorkspaceSurfaceAdapterRegistration,
    organizationId: string,
    brandId?: string,
  ) => void;
  readonly deactivateAdapter: (key: string) => void;
  readonly setArtifactReferences: (
    key: string,
    references: readonly AgentArtifactReference[],
  ) => void;
}

interface WorkspaceSurfaceAdapterProviderProps {
  readonly children: ReactNode;
}

interface WorkspaceSurfaceAdapterRegistrationProps {
  readonly children: ReactNode;
  readonly registration: WorkspaceSurfaceAdapterRegistration;
}

interface WorkspaceSurfaceSelectionContextValue {
  readonly adapterKey: string;
  readonly setArtifactReferences: (
    references: readonly AgentArtifactReference[],
  ) => void;
}

const WorkspaceSurfaceAdapterContext =
  createContext<WorkspaceSurfaceAdapterContextValue | null>(null);

const WorkspaceSurfaceSelectionContext =
  createContext<WorkspaceSurfaceSelectionContextValue | null>(null);

const ProductWorkspaceSurfaceAdapterContext =
  createContext<ProductWorkspaceSurfaceAdapter | null>(null);

const ProductWorkspaceSurfaceAdapterRegistrarContext =
  createContext<ProductWorkspaceSurfaceAdapterRegistrar | null>(null);

function areScopesEqual(
  adapter: ActiveWorkspaceSurfaceAdapter,
  organizationId: string,
  brandId?: string,
): boolean {
  return (
    adapter.organizationId === organizationId && adapter.brandId === brandId
  );
}

function scopeEligibleReferences(
  adapter: ActiveWorkspaceSurfaceAdapter,
  references: readonly AgentArtifactReference[],
): readonly AgentArtifactReference[] {
  const allowedKinds = new Set(adapter.registration.supportedReferenceKinds);
  const uniqueReferences = new Map<string, AgentArtifactReference>();

  for (const reference of references) {
    const isBrandAuthorized =
      adapter.registration.scope === 'organization'
        ? reference.brandId === undefined
        : Boolean(adapter.brandId && reference.brandId === adapter.brandId);

    if (
      reference.organizationId !== adapter.organizationId ||
      !isBrandAuthorized ||
      !allowedKinds.has(reference.kind)
    ) {
      continue;
    }

    uniqueReferences.set(`${reference.kind}:${reference.recordId}`, reference);
  }

  return Object.freeze([...uniqueReferences.values()]);
}

export function WorkspaceSurfaceAdapterProvider({
  children,
}: WorkspaceSurfaceAdapterProviderProps): ReactElement {
  const [activeAdapter, setActiveAdapter] =
    useState<ActiveWorkspaceSurfaceAdapter | null>(null);
  const [productAdapter, setProductAdapter] =
    useState<ProductWorkspaceSurfaceAdapter | null>(null);

  const registerProductAdapter = useCallback(
    (registration: ProductWorkspaceSurfaceAdapter) => {
      setProductAdapter(registration);

      return () => {
        setProductAdapter((current) =>
          current === registration ? null : current,
        );
      };
    },
    [],
  );

  const activateAdapter = useCallback(
    (
      registration: WorkspaceSurfaceAdapterRegistration,
      organizationId: string,
      brandId?: string,
    ) => {
      setActiveAdapter((current) => {
        if (
          current?.registration.key === registration.key &&
          areScopesEqual(current, organizationId, brandId)
        ) {
          return current;
        }

        return {
          artifactReferences: Object.freeze([]),
          ...(brandId ? { brandId } : {}),
          organizationId,
          registration,
        };
      });
    },
    [],
  );

  const deactivateAdapter = useCallback((key: string) => {
    setActiveAdapter((current) =>
      current?.registration.key === key ? null : current,
    );
  }, []);

  const setArtifactReferences = useCallback(
    (key: string, references: readonly AgentArtifactReference[]) => {
      setActiveAdapter((current) => {
        if (!current || current.registration.key !== key) {
          return current;
        }

        return {
          ...current,
          artifactReferences: scopeEligibleReferences(current, references),
        };
      });
    },
    [],
  );

  const value = useMemo<WorkspaceSurfaceAdapterContextValue>(
    () => ({
      activeAdapter,
      activateAdapter,
      deactivateAdapter,
      setArtifactReferences,
    }),
    [activeAdapter, activateAdapter, deactivateAdapter, setArtifactReferences],
  );

  return (
    <ProductWorkspaceSurfaceAdapterRegistrarContext.Provider
      value={registerProductAdapter}
    >
      <ProductWorkspaceSurfaceAdapterContext.Provider value={productAdapter}>
        <WorkspaceSurfaceAdapterContext.Provider value={value}>
          {children}
        </WorkspaceSurfaceAdapterContext.Provider>
      </ProductWorkspaceSurfaceAdapterContext.Provider>
    </ProductWorkspaceSurfaceAdapterRegistrarContext.Provider>
  );
}

export function WorkspaceSurfaceAdapterRegistration({
  children,
  registration,
}: WorkspaceSurfaceAdapterRegistrationProps): ReactElement {
  const adapterContext = useContext(WorkspaceSurfaceAdapterContext);
  const activateAdapter = adapterContext?.activateAdapter;
  const deactivateAdapter = adapterContext?.deactivateAdapter;
  const updateArtifactReferences = adapterContext?.setArtifactReferences;
  const { brandId, organizationId } = useBrand();
  const scopedBrandId = registration.scope === 'brand' ? brandId : undefined;

  useLayoutEffect(() => {
    if (
      !activateAdapter ||
      !deactivateAdapter ||
      !organizationId ||
      (registration.scope === 'brand' && !scopedBrandId)
    ) {
      return;
    }

    activateAdapter(registration, organizationId, scopedBrandId);

    return () => {
      deactivateAdapter(registration.key);
    };
  }, [
    activateAdapter,
    deactivateAdapter,
    organizationId,
    registration,
    scopedBrandId,
  ]);

  const selectionValue = useMemo<WorkspaceSurfaceSelectionContextValue>(
    () => ({
      adapterKey: registration.key,
      setArtifactReferences: (references) => {
        updateArtifactReferences?.(registration.key, references);
      },
    }),
    [registration.key, updateArtifactReferences],
  );

  return (
    <WorkspaceSurfaceSelectionContext.Provider value={selectionValue}>
      {children}
    </WorkspaceSurfaceSelectionContext.Provider>
  );
}

export function useActiveWorkspaceSurfaceAdapter(): ActiveWorkspaceSurfaceAdapter | null {
  return useContext(WorkspaceSurfaceAdapterContext)?.activeAdapter ?? null;
}

export function useWorkspaceSurfaceSelection(): WorkspaceSurfaceSelectionContextValue | null {
  return useContext(WorkspaceSurfaceSelectionContext);
}

export function useWorkspaceSurfaceAdapter(): ProductWorkspaceSurfaceAdapter | null {
  return useContext(ProductWorkspaceSurfaceAdapterContext);
}

/**
 * Product routes register only while mounted inside the universal shell. In the
 * legacy routed experience the hook intentionally becomes a no-op.
 */
export function useRegisterWorkspaceSurfaceAdapter(
  registration: ProductWorkspaceSurfaceAdapter,
): void {
  const register = useContext(ProductWorkspaceSurfaceAdapterRegistrarContext);

  useLayoutEffect(() => {
    if (!register) {
      return;
    }

    return register(registration);
  }, [register, registration]);
}
