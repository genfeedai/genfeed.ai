import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalConfirmProps } from '@props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';

export default function ModalConfirm({
  label = 'Confirm',
  message = 'Are you sure?',
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  isError = false,

  onConfirm,
  onClose,
  isOpen,
  openKey,
}: ModalConfirmProps) {
  useModalAutoOpen(ModalEnum.CONFIRM, { isOpen, openKey });

  // Refs for callbacks to prevent re-renders
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [isConfirming, setIsConfirming] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const closeConfirmModal = useCallback(() => {
    // If onClose is provided, let the parent handle closing
    // Otherwise, close the modal directly
    if (onCloseRef.current) {
      onCloseRef.current();
    } else {
      closeModal(ModalEnum.CONFIRM);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);

    try {
      // Call onConfirm first, then close
      // The parent (provider) will handle closing when onClose is provided
      await onConfirmRef.current();

      if (!onCloseRef.current) {
        closeModal(ModalEnum.CONFIRM);
      }
    } finally {
      if (isMountedRef.current) {
        setIsConfirming(false);
      }
    }
  }, []);

  return (
    <Modal id={ModalEnum.CONFIRM} isError={isError}>
      <div className="text-center">
        {isError && (
          <div className="mx-auto flex items-center justify-center w-12 h-12 mb-4 bg-error/10 rounded-full">
            <HiOutlineExclamationTriangle className="w-6 h-6 text-error" />
          </div>
        )}

        {label && <h3 className="text-lg font-semibold mb-2">{label}</h3>}

        <p>{message}</p>
      </div>

      <ModalActions>
        <Button
          label={cancelLabel}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.LG}
          className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0 w-32"
          onClick={closeConfirmModal}
        />

        <Button
          label={confirmLabel}
          variant={isError ? ButtonVariant.DESTRUCTIVE : ButtonVariant.DEFAULT}
          size={ButtonSize.LG}
          className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0 w-32"
          onClick={handleConfirm}
          isLoading={isConfirming}
          isDisabled={isConfirming}
        />
      </ModalActions>
    </Modal>
  );
}
