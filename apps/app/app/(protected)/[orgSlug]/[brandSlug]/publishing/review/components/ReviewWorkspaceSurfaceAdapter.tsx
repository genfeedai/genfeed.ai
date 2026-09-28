import {
  ContextSidebarPanel,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import { useAgentChatStore } from '@genfeedai/agent';
import type { ReviewWorkspaceSurfaceAdapterProps } from '@props/publishing/review-workspace-surface-adapter.props';
import { ClipboardCheck, Sparkles, SquarePen, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createElement, useCallback, useEffect, useState } from 'react';

import ReviewDetailPanel from './ReviewDetailPanel';
import { getReviewItemTitle } from './review-item.helpers';
import { isReadyToReview } from './review-state';

/**
 * Renders the active review item into the shell's context sidebar so the
 * canvas stays a table-only queue, and keeps the agent's page context on it.
 * The queue always keeps an active row, so closing dismisses the details (the
 * right column goes back to the workspace panes) until a row tap or "Open in
 * Context" asks for them again.
 */
export default function ReviewWorkspaceSurfaceAdapter({
  activeItem,
  activeItemOrigin,
  isActioning,
  isSelected,
  onApprove,
  onAssign,
  onReject,
  onRequestChanges,
  onToggleSelect,
  onUnassign,
  revealRequest,
}: ReviewWorkspaceSurfaceAdapterProps) {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((state) => state.setPageContext);
  const reveal = useContextSidebar()?.reveal;
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRevealPending, setIsRevealPending] = useState(false);
  const handleClose = useCallback(() => {
    setIsDismissed(true);
  }, []);
  const requestDetails = useCallback(() => {
    setIsDismissed(false);
    setIsRevealPending(true);
  }, []);

  // Every row tap asks for the details, including a tap on the active row.
  useEffect(() => {
    if (revealRequest > 0) {
      requestDetails();
    }
  }, [requestDetails, revealRequest]);

  // Reveal only once the selection is registered again.
  useEffect(() => {
    if (!isRevealPending || isDismissed) {
      return;
    }
    setIsRevealPending(false);
    reveal?.();
  }, [isDismissed, isRevealPending, reveal]);

  // Explicit "Open in Context" row action.
  useEffect(() => {
    const handleForceOpen = (): void => {
      requestDetails();
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
  }, [requestDetails]);

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

  return (
    <ContextSidebarPanel
      onClose={handleClose}
      selection={
        activeItem && !isDismissed
          ? {
              id: activeItem.id,
              kind: 'post',
              origin: activeItemOrigin,
              title: getReviewItemTitle(activeItem),
            }
          : null
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
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
    </ContextSidebarPanel>
  );
}
