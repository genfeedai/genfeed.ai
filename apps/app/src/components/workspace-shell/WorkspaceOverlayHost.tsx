'use client';

import type { WorkspaceOverlayHostProps } from '@genfeedai/props/ui/workspace-overlay-host.props';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
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
 * The only dialog host owned by the universal workspace shell. Product entity
 * inspection sheets remain outside this host and registered shell overlays may
 * contribute only their trusted metadata and typed parameters.
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
    <Dialog
      open={isOpen && isResolved}
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) {
          onDismiss();
        }
      }}
    >
      {isResolved && registration ? (
        <DialogContent
          className="w-[min(92vw,42rem)] bg-background p-0 shadow-dialog"
          data-workspace-overlay-key={registration.key}
          data-workspace-shell-overlay="true"
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
        >
          <DialogHeader className="border-b border-border p-5 pr-12">
            <DialogTitle>{registration.presentation.title}</DialogTitle>
            <DialogDescription>
              {registration.presentation.description}
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
