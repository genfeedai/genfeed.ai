import type { ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useCallback, useState } from 'react';

export function useModalState<T = unknown, D = unknown>() {
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [modalData, setModalData] = useState<D | null>(null);

  const openModalWithItem = useCallback(
    (modalId: ModalEnum, item?: T, data?: D) => {
      if (item) {
        setSelectedItem(item);
      }
      if (data) {
        setModalData(data);
      }
      openModal(modalId);
    },
    [],
  );

  const closeModalAndReset = useCallback(() => {
    setSelectedItem(null);
    setModalData(null);
  }, []);

  return {
    closeModalAndReset,
    modalData,
    openModalWithItem,
    selectedItem,
    setModalData,
    setSelectedItem,
  };
}
