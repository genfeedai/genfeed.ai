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
          'flex max-h-[calc(100vh-5rem)] flex-col',
          isFullScreen ? 'overflow-hidden' : 'overflow-auto',
          // Error shell must set border WIDTH + color. Color-only utilities
          // (border-destructive/50) paint nothing without `border`.
          isError &&
            'border-2 border-destructive bg-card text-foreground shadow-[0_0_0_1px_rgba(239,68,68,0.35)]',
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
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-3 text-sm font-medium text-destructive">
                <TriangleAlert className="size-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CompoundModal.Header>
        )}

        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </CompoundModal.Content>
    </CompoundModal.Root>
  );
}
