'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  closeModal,
  isModalOpen,
  openModal,
  subscribeModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import { Modal as CompoundModal } from '@ui/modals/compound/modal.compound';
import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Backward-compatible modal wrapper built on top of the compound modal system.
 * Uses store-backed modal state via modal.helper APIs.
 */
export default function Modal({
  id,
  title,
  accessibleTitle,
  children,
  isFullScreen = false,
  isError = false,
  showCloseButton = true,
  error,
  onClose,
  modalBoxClassName = '',
  size = 'lg',
}: ModalProps) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeModal(id, listener),
    [id],
  );
  const getSnapshot = useCallback(() => isModalOpen(id), [id]);
  const isOpen = useSyncExternalStore(subscribe, getSnapshot, () => false);

  // Use ref to avoid re-running callbacks when onClose changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousOpenRef = useRef(isOpen);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openModal(id);
        return;
      }

      closeModal(id);
    },
    [id],
  );

  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    if (wasOpen && !isOpen) {
      onCloseRef.current?.();
    }
    previousOpenRef.current = isOpen;
  }, [isOpen]);

  return (
    <CompoundModal.Root open={isOpen} onOpenChange={handleOpenChange}>
      <CompoundModal.Content
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current;
          returnFocusRef.current = null;
          if (!target?.isConnected) return;
          // Respect focus already moved to another surface by an action.
          const closingDialog = event.target;
          if (
            document.activeElement !== document.body &&
            closingDialog instanceof HTMLElement &&
            !closingDialog.contains(document.activeElement)
          )
            return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
        size={isFullScreen ? 'full' : size}
        className={cn(
          // Error dialogs keep normal shell chrome — no red outer ring/border.
          // Severity is carried by the message row, not the dialog frame.
          isError && 'bg-card text-foreground',
          modalBoxClassName,
        )}
        showCloseButton={showCloseButton}
      >
        {!title && !error && (
          <CompoundModal.Header className="sr-only">
            <CompoundModal.Title>
              {accessibleTitle ?? 'Dialog'}
            </CompoundModal.Title>
          </CompoundModal.Header>
        )}

        {(title || error) && (
          <CompoundModal.Header>
            {title && <CompoundModal.Title>{title}</CompoundModal.Title>}

            {error && (
              <div
                className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background-secondary px-4 py-3 text-sm font-medium text-foreground"
                role={isError ? 'alert' : undefined}
              >
                <TriangleAlert
                  className={cn(
                    'size-5 shrink-0',
                    isError ? 'text-amber-400' : 'text-muted-foreground',
                  )}
                />
                <span>{error}</span>
              </div>
            )}
          </CompoundModal.Header>
        )}

        <CompoundModal.Body
          // Match the spacing of forms inside the shared scroll region.
          className="flex flex-col gap-4 py-0"
        >
          {children}
        </CompoundModal.Body>
      </CompoundModal.Content>
    </CompoundModal.Root>
  );
}
