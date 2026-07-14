'use client';

import type { WorkspaceOverlayHostProps } from '@genfeedai/props/ui/workspace-overlay-host.props';
import ContextInspector from '@ui/overlays/context-inspector/ContextInspector';
import LibraryPickerOverlay from '@/features/library-remix/LibraryPickerOverlay';

function formatOverlayParameters(
  overlay: WorkspaceOverlayHostProps['overlay'],
): string {
  if (overlay?.key !== 'shell-preview' || !overlay.parameters.reference) {
    return 'No resource reference selected';
  }

  return `${overlay.parameters.reference.kind} reference selected`;
}

/**
 * The only context-inspector host owned by the universal workspace shell.
 * Product entity inspection sheets remain outside this host and registered
 * shell overlays may contribute only their trusted metadata and typed parameters.
 */
export default function WorkspaceOverlayHost({
  composerPortalRef,
  content,
  fallbackFocusRef,
  isOpen,
  onDismiss,
  onSelectLibraryReference,
  overlay,
  registration,
  returnFocusRef,
  threadId,
}: WorkspaceOverlayHostProps) {
  const isResolved = Boolean(
    overlay && registration && overlay.key === registration.key,
  );

  return (
    <ContextInspector
      bodyClassName="flex min-h-0 flex-col"
      className="rounded-l-[var(--radius-workspace-overlay)]"
      description={registration?.presentation.description}
      isOpen={isOpen && isResolved}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) {
          onDismiss();
        }
      }}
      onCloseAutoFocus={(event) => {
        const returnFocusTarget = returnFocusRef.current?.isConnected
          ? returnFocusRef.current
          : fallbackFocusRef.current;
        returnFocusRef.current = null;
        if (!returnFocusTarget?.isConnected) {
          return;
        }

        event.preventDefault();
        returnFocusTarget.focus({ preventScroll: true });
      }}
      title={registration?.presentation.title ?? 'Context inspector'}
      width="lg"
    >
      {isResolved && registration ? (
        <div
          className="flex min-h-0 flex-1 flex-col"
          data-workspace-overlay-key={registration.key}
          data-workspace-shell-overlay="true"
        >
          {content ??
            (overlay?.key === 'library-picker' && onSelectLibraryReference ? (
              <LibraryPickerOverlay
                onSelect={onSelectLibraryReference}
                threadId={threadId}
              />
            ) : (
              <div className="p-5 pb-2 text-sm text-muted-foreground">
                {formatOverlayParameters(overlay)}
              </div>
            ))}
          <div
            className="border-t border-border p-3"
            data-testid="workspace-overlay-composer-slot"
            ref={composerPortalRef}
          />
        </div>
      ) : null}
    </ContextInspector>
  );
}
