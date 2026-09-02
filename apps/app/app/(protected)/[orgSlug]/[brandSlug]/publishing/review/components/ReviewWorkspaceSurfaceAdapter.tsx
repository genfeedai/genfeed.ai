'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentChatStore } from '@genfeedai/agent';
import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import { ClipboardCheck, Sparkles, SquarePen, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createElement, useCallback, useEffect, useMemo, useRef } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfacePresentationAdapter,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { dispatchOpenContextTab } from '@/lib/workspace/agent-composer-events';

import ReviewDetailPanel from './ReviewDetailPanel';
import { getReviewItemTitle } from './review-item.helpers';
import { isReadyToReview } from './review-state';

interface ReviewWorkspaceSurfaceAdapterProps {
  activeItem: IBatchItem | null;
  isActioning: boolean;
  isSelected: boolean;
  onApprove: (itemId: string) => void;
  onAssign: (itemId: string, assigneeId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => void;
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
  onAssign,
  onReject,
  onRequestChanges,
  onToggleSelect,
  onUnassign,
}: ReviewWorkspaceSurfaceAdapterProps) {
  const pathname = usePathname();
  const { brandId, organizationId } = useBrand();
  const setPageContext = useAgentChatStore((state) => state.setPageContext);
  const inspector = useWorkspaceInspector();
  // Stable setters — the full `inspector` object identity flips whenever
  // isOpen changes, which would re-fire an open-on-select effect and fight
  // the topbar collapse control.
  const setInspectorOpen = inspector?.setIsOpen;
  const previousActiveItemIdRef = useRef<string | null>(null);

  // Auto-open the Context rail when the selected row *changes* to a new item.
  // Never re-open just because the operator collapsed the rail while a row is
  // still selected (that is what broke "collapse then click another row").
  useEffect(() => {
    const nextId = activeItem?.id ?? null;
    const previousId = previousActiveItemIdRef.current;
    previousActiveItemIdRef.current = nextId;

    if (!nextId || nextId === previousId || !setInspectorOpen) {
      return;
    }

    setInspectorOpen(true);
    dispatchOpenContextTab();
  }, [activeItem?.id, setInspectorOpen]);

  // Explicit "Open in Context" row action — must open even when the same row
  // is already selected and the rail was collapsed.
  useEffect(() => {
    if (!setInspectorOpen) {
      return;
    }

    const handleForceOpen = (): void => {
      setInspectorOpen(true);
      dispatchOpenContextTab();
    };

    window.addEventListener(
      'workspace:force-open-review-context',
      handleForceOpen,
    );
    return () => {
      window.removeEventListener(
        'workspace:force-open-review-context',
        handleForceOpen,
      );
    };
  }, [setInspectorOpen]);

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
          onAssign={onAssign}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
          onToggleSelect={onToggleSelect}
          onUnassign={onUnassign}
        />
      </div>
    ),
    [
      activeItem,
      isActioning,
      isSelected,
      onApprove,
      onAssign,
      onReject,
      onRequestChanges,
      onToggleSelect,
      onUnassign,
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
      surfaceKey: 'publishing',
    }),
    [brandId, contextLabel, organizationId, renderInspector],
  );

  // Presentation adapter is a second registration path used by some shell
  // branches — keep both so Context never falls through empty on review.
  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({
      contextLabel,
      inspector: inspectorNode,
      surfaceKey: 'publishing',
    }),
    [contextLabel, inspectorNode],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);
  return null;
}
