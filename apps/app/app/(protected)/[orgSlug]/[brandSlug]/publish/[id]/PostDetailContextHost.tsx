'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfacePresentationAdapter,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

/**
 * Hosts post meta (schedule, platform, quality, SEO) in the workspace Context
 * rail — same product-surface pattern as review detail.
 */
export default function PostDetailContextHost({
  children,
  contextLabel,
}: {
  children: ReactNode;
  contextLabel: string;
}) {
  const { brandId, organizationId } = useBrand();
  const inspector = useWorkspaceInspector();
  const setInspectorOpen = inspector?.setIsOpen;
  const didOpenRef = useRef(false);

  useEffect(() => {
    if (!setInspectorOpen || didOpenRef.current) {
      return;
    }
    didOpenRef.current = true;
    setInspectorOpen(true);
    window.dispatchEvent(new CustomEvent('workspace:open-context-tab'));
  }, [setInspectorOpen]);

  const inspectorNode = useMemo(
    () => (
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4"
        data-testid="post-detail-context-inspector"
      >
        <div className="space-y-1 border-b border-border pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Post
          </p>
          <h3 className="text-sm font-medium text-foreground">
            {contextLabel}
          </h3>
        </div>
        {children}
      </div>
    ),
    [children, contextLabel],
  );

  const registration = useMemo<ProductWorkspaceSurfaceAdapter>(
    () => ({
      contextLabel: `Post · ${contextLabel}`,
      references: [],
      renderInspector: () => inspectorNode,
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId: organizationId ?? '',
      },
      surfaceKey: 'publish',
    }),
    [brandId, contextLabel, inspectorNode, organizationId],
  );

  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({
      contextLabel: `Post · ${contextLabel}`,
      inspector: inspectorNode,
      surfaceKey: 'publish',
    }),
    [contextLabel, inspectorNode],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);
  return null;
}
