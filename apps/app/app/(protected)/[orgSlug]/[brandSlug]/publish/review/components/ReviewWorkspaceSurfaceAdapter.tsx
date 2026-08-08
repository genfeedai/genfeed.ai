'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentChatStore } from '@genfeedai/agent';
import type { IBatchItem } from '@genfeedai/interfaces';
import { ClipboardCheck, Sparkles, SquarePen, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createElement, useCallback, useEffect, useMemo } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfacePresentationAdapter,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';

import ReviewDetailPanel from './ReviewDetailPanel';
import { getReviewItemTitle } from './review-item.helpers';
import { isReadyToReview } from './review-state';

interface ReviewWorkspaceSurfaceAdapterProps {
  activeItem: IBatchItem | null;
  isActioning: boolean;
  isSelected: boolean;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
}

/**
 * Project review details into the workspace agent Context rail so the canvas
 * stays a table-only queue. Conversation remains available for agent cleanup.
 */
export default function ReviewWorkspaceSurfaceAdapter({
  activeItem,
  isActioning,
  isSelected,
  onApprove,
  onReject,
  onRequestChanges,
  onToggleSelect,
}: ReviewWorkspaceSurfaceAdapterProps) {
  const pathname = usePathname();
  const { brandId, organizationId } = useBrand();
  const setPageContext = useAgentChatStore((state) => state.setPageContext);
  const inspector = useWorkspaceInspector();

  useEffect(() => {
    if (!activeItem || !inspector) {
      return;
    }
    if (!inspector.isOpen) {
      inspector.setIsOpen(true);
    }
    // Ask the shell to show Context when a row is selected (product details).
    window.dispatchEvent(new CustomEvent('workspace:open-context-tab'));
  }, [activeItem, inspector]);

  useEffect(() => {
    const currentContext = useAgentChatStore.getState().pageContext;
    const baseActions = currentContext?.suggestedActions ?? [];
    const title = activeItem ? getReviewItemTitle(activeItem) : null;
    const caption =
      activeItem?.caption?.trim() || activeItem?.prompt?.trim() || '';
    const isReady = activeItem ? isReadyToReview(activeItem) : false;

    const selectionActions = activeItem
      ? [
          ...(isReady
            ? [
                {
                  icon: createElement(ClipboardCheck, {
                    className: 'size-5 text-emerald-400',
                  }),
                  label: 'Approve',
                  prompt: `Approve and schedule this review item (${activeItem.id}): "${title}".`,
                },
                {
                  icon: createElement(SquarePen, {
                    className: 'size-5 text-amber-300',
                  }),
                  label: 'Request changes',
                  prompt: `Request changes on review item ${activeItem.id} ("${title}"). Suggest a sharper caption and what to fix.`,
                },
                {
                  icon: createElement(X, {
                    className: 'size-5 text-foreground/50',
                  }),
                  label: 'Reject',
                  prompt: `Reject review item ${activeItem.id} ("${title}") and explain why it should not ship.`,
                },
              ]
            : []),
          {
            icon: createElement(Sparkles, {
              className: 'size-5 text-foreground/50',
            }),
            label: 'Rewrite',
            prompt: `Rewrite the caption for this review item (${activeItem.id}) while keeping the platform and intent. Current caption:\n\n${caption || '(empty)'}`,
          },
        ]
      : baseActions;

    setPageContext({
      ...(currentContext?.route === pathname ? currentContext : {}),
      contentFormat: activeItem?.format
        ? String(activeItem.format)
        : currentContext?.contentFormat,
      draftBody: caption || undefined,
      draftSummary: title || undefined,
      draftTitle: title || undefined,
      draftType: activeItem ? 'review-item' : currentContext?.draftType,
      placeholder: activeItem
        ? 'Ask the agent to clean up or decide on this post...'
        : (currentContext?.placeholder ?? 'Ask about content review...'),
      postContent: caption || undefined,
      route: pathname,
      suggestedActions: selectionActions.slice(0, 4),
      url: activeItem?.postUrl || undefined,
    });

    return () => {
      const latest = useAgentChatStore.getState().pageContext;
      if (latest?.route !== pathname || latest?.draftType !== 'review-item') {
        return;
      }
      const {
        contentFormat: _c,
        draftBody: _b,
        draftSummary: _s,
        draftTitle: _t,
        draftType: _d,
        postContent: _p,
        url: _u,
        ...rest
      } = latest;
      setPageContext({
        ...rest,
        placeholder: 'Ask about content review...',
        route: pathname,
        suggestedActions:
          baseActions.length > 0 ? baseActions : rest.suggestedActions,
      });
    };
  }, [activeItem, pathname, setPageContext]);

  const inspectorNode = useMemo(
    () => (
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="review-surface-inspector"
      >
        <ReviewDetailPanel
          isActioning={isActioning}
          isSelected={isSelected}
          item={activeItem}
          onApprove={onApprove}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
          onToggleSelect={onToggleSelect}
        />
      </div>
    ),
    [
      activeItem,
      isActioning,
      isSelected,
      onApprove,
      onReject,
      onRequestChanges,
      onToggleSelect,
    ],
  );

  const renderInspector = useCallback(() => inspectorNode, [inspectorNode]);

  const contextLabel = activeItem
    ? `Review · ${getReviewItemTitle(activeItem)}`
    : 'Review · Queue';

  const registration = useMemo<ProductWorkspaceSurfaceAdapter>(
    () => ({
      contextLabel,
      references: [],
      renderInspector,
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId: organizationId ?? '',
      },
      surfaceKey: 'publish',
    }),
    [brandId, contextLabel, organizationId, renderInspector],
  );

  // Presentation adapter is a second registration path used by some shell
  // branches — keep both so Context never falls through empty on review.
  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({
      contextLabel,
      inspector: inspectorNode,
      surfaceKey: 'publish',
    }),
    [contextLabel, inspectorNode],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);
  return null;
}
