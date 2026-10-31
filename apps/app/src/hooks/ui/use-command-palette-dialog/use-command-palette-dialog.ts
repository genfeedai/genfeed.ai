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
