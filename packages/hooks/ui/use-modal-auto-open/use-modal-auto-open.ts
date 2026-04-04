'use client';

import type { ModalEnum } from '@genfeedai/enums';
import { closeModal, openModal } from '@helpers/ui/modal/modal.helper';
import { useEffect } from 'react';

export interface UseModalAutoOpenOptions {
  isOpen?: boolean;
  openKey?: number | string;
}

/**
 * Ensures a modal only attempts to open once its component tree has mounted.
 * This prevents timing issues when opening lazy-loaded dialogs.
 */
export function useModalAutoOpen(
  modalId: ModalEnum | string,
  { isOpen, openKey }: UseModalAutoOpenOptions = {},
) {
  const shouldAutoOpen = isOpen === true;
  const shouldAutoClose = isOpen === false;

  useEffect(() => {
    if (!shouldAutoOpen) {
      if (shouldAutoClose) {
        closeModal(modalId);
      }
      return;
    }

    let rafId: number | null = null;
    let rafId2: number | null = null;

    rafId = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        openModal(modalId);
      });
    });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (rafId2 !== null) {
        cancelAnimationFrame(rafId2);
      }
    };
  }, [modalId, shouldAutoOpen, shouldAutoClose]);
}
