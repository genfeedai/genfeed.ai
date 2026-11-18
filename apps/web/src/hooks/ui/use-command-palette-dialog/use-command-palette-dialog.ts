'use client';

import {
  closeModal,
  isModalOpen,
  openModal,
} from '@helpers/ui/modal/modal.helper';
import { useEffect, useRef } from 'react';

export interface UseCommandPaletteDialogOptions {
  modalId: string;
  isOpen: boolean;
  onAfterOpen?: () => void;
}

export function useCommandPaletteDialog({
  modalId,
  isOpen,
  onAfterOpen,
}: UseCommandPaletteDialogOptions): void {
  const onAfterOpenRef = useRef(onAfterOpen);
  onAfterOpenRef.current = onAfterOpen;

  // use-effect-audit: ignore keeps the modal store in step with the open state and closes it on unmount
  useEffect(() => {
    if (isOpen && !isModalOpen(modalId)) {
      openModal(modalId);
      onAfterOpenRef.current?.();
    } else if (!isOpen && isModalOpen(modalId)) {
      closeModal(modalId);
    }

    return () => {
      if (isModalOpen(modalId)) {
        closeModal(modalId);
      }
    };
  }, [isOpen, modalId]);
}
