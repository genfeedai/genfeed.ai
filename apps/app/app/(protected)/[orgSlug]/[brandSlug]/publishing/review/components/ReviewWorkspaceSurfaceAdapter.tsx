import {
  ContextSidebarPanel,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import { useAgentChatStore } from '@genfeedai/agent';
import type { ReviewWorkspaceSurfaceAdapterProps } from '@props/publishing/review-workspace-surface-adapter.props';
import { ClipboardCheck, Sparkles, SquarePen, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('pages.publishing.review');
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
    const title = activeItem ? getReviewItemTitle(activeItem, translate) : null;
    const caption =
      activeItem?.caption?.trim() || activeItem?.prompt?.trim() || '';
    const isReady = activeItem ? isReadyToReview(activeItem) : false;

    const selectionActions = activeItem
      ? [
          ...(isReady
            ? [
                {
                  icon: createElement(ClipboardCheck, {
                    className: 'size-5 text-success',
                  }),
                  label: translate('decision.approve'),
                  prompt: translate('context.approvePrompt', {
                    id: activeItem.id,
                    title: title ?? '',
                  }),
                },
                {
                  icon: createElement(SquarePen, {
                    className: 'size-5 text-warning',
                  }),
                  label: translate('decision.requestChanges'),
                  prompt: translate('context.changesPrompt', {
                    id: activeItem.id,
                    title: title ?? '',
                  }),
                },
                {
                  icon: createElement(X, {
                    className: 'size-5 text-foreground/50',
                  }),
                  label: translate('decision.reject'),
                  prompt: translate('context.rejectPrompt', {
                    id: activeItem.id,
                    title: title ?? '',
                  }),
                },
              ]
            : []),
          {
            icon: createElement(Sparkles, {
              className: 'size-5 text-foreground/50',
            }),
            label: translate('context.rewrite'),
            prompt: translate('context.rewritePrompt', {
              id: activeItem.id,
              caption: caption || translate('context.emptyCaption'),
            }),
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
        ? translate('context.selectedPlaceholder')
        : (currentContext?.placeholder ?? translate('context.placeholder')),
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
        placeholder: translate('context.placeholder'),
        route: pathname,
        suggestedActions:
          baseActions.length > 0 ? baseActions : rest.suggestedActions,
      });
    };
  }, [activeItem, pathname, setPageContext, translate]);

  return (
    <ContextSidebarPanel
      onClose={handleClose}
      selection={
        activeItem && !isDismissed
          ? {
              id: activeItem.id,
              kind: 'post',
              origin: activeItemOrigin,
              title: getReviewItemTitle(activeItem, translate),
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
