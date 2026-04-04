'use client';

import type { ModalEnum } from '@genfeedai/enums';
import {
  closeModal,
  isModalOpen,
  openModal,
  subscribeModal,
} from '@helpers/ui/modal/modal.helper';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

export interface IUseModalOptions {
  onOpen?: () => void;
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
}

export function useModal(
  modalId: ModalEnum | string,
  options?: IUseModalOptions,
) {
  const modalRef = useRef<HTMLElement | null>(null);
  const optionsRef = useRef(options);
  const previousOpenRef = useRef(false);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const subscribe = useCallback(
    (listener: () => void) => subscribeModal(modalId, listener),
    [modalId],
  );
  const getSnapshot = useCallback(() => isModalOpen(modalId), [modalId]);
  const isOpen = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const checkIsOpen = useCallback(() => {
    return isModalOpen(modalId);
  }, [modalId]);

  const open = useCallback(() => {
    openModal(modalId);
  }, [modalId]);

  const close = useCallback(() => {
    const closed = closeModal(modalId);
    return closed;
  }, [modalId]);

  const toggle = useCallback(() => {
    if (checkIsOpen()) {
      return close();
    } else {
      return open();
    }
  }, [checkIsOpen, close, open]);

  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    if (!wasOpen && isOpen) {
      optionsRef.current?.onOpen?.();
    }
    if (wasOpen && !isOpen) {
      optionsRef.current?.onClose?.();
    }
    previousOpenRef.current = isOpen;
  }, [isOpen]);

  return {
    close,
    isOpen,
    modalRef,
    open,
    toggle,
  };
}
