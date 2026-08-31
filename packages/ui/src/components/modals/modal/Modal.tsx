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
  children,
  isFullScreen = false,
  isError = false,
  showCloseButton = true,
  error,
  onClose,
  modalBoxClassName = '',
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
        size={isFullScreen ? 'full' : 'lg'}
        className={cn(
          'flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden',
          // Error dialogs keep normal shell chrome — no red outer ring/border.
          // Severity is carried by the message row, not the dialog frame.
          isError && 'bg-card text-foreground',
          modalBoxClassName,
        )}
        showCloseButton={showCloseButton}
      >
        {!title && !error && (
          <CompoundModal.Header className="sr-only">
            <CompoundModal.Title>Dialog</CompoundModal.Title>
          </CompoundModal.Header>
        )}

        {(title || error) && (
          <CompoundModal.Header className="flex-shrink-0">
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

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            !isFullScreen && 'overflow-y-auto',
          )}
          data-modal-scroll-region=""
        >
          {children}
        </div>
      </CompoundModal.Content>
    </CompoundModal.Root>
  );
}
