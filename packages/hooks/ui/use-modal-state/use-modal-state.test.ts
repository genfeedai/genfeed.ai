import { ModalEnum } from '@genfeedai/enums';
import { useModalState } from '@hooks/ui/use-modal-state/use-modal-state';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOpenModal = vi.fn();

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: (modalId: string) => mockOpenModal(modalId),
}));

describe('useModalState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('returns selectedItem as null by default', () => {
      const { result } = renderHook(() => useModalState());

      expect(result.current.selectedItem).toBeNull();
    });

    it('returns modalData as null by default', () => {
      const { result } = renderHook(() => useModalState());

      expect(result.current.modalData).toBeNull();
    });

    it('returns setSelectedItem function', () => {
      const { result } = renderHook(() => useModalState());

      expect(typeof result.current.setSelectedItem).toBe('function');
    });

    it('returns setModalData function', () => {
      const { result } = renderHook(() => useModalState());

      expect(typeof result.current.setModalData).toBe('function');
    });

    it('returns openModalWithItem function', () => {
      const { result } = renderHook(() => useModalState());

      expect(typeof result.current.openModalWithItem).toBe('function');
    });

    it('returns closeModalAndReset function', () => {
      const { result } = renderHook(() => useModalState());

      expect(typeof result.current.closeModalAndReset).toBe('function');
    });
  });

  describe('setSelectedItem', () => {
    it('updates selectedItem', () => {
      const { result } = renderHook(() =>
        useModalState<{ id: string; name: string }>(),
      );

      act(() => {
        result.current.setSelectedItem({ id: '123', name: 'Test Item' });
      });

      expect(result.current.selectedItem).toEqual({
        id: '123',
        name: 'Test Item',
      });
    });

    it('can clear selectedItem to null', () => {
      const { result } = renderHook(() => useModalState<{ id: string }>());

      act(() => {
        result.current.setSelectedItem({ id: '123' });
      });

      act(() => {
        result.current.setSelectedItem(null);
      });

      expect(result.current.selectedItem).toBeNull();
    });
  });

  describe('setModalData', () => {
    it('updates modalData', () => {
      const { result } = renderHook(() =>
        useModalState<unknown, { action: string }>(),
      );

      act(() => {
        result.current.setModalData({ action: 'delete' });
      });

      expect(result.current.modalData).toEqual({ action: 'delete' });
    });

    it('can clear modalData to null', () => {
      const { result } = renderHook(() =>
        useModalState<unknown, { action: string }>(),
      );

      act(() => {
        result.current.setModalData({ action: 'edit' });
      });

      act(() => {
        result.current.setModalData(null);
      });

      expect(result.current.modalData).toBeNull();
    });
  });

  describe('openModalWithItem', () => {
    it('opens modal with given modalId', () => {
      const { result } = renderHook(() => useModalState());

      act(() => {
        result.current.openModalWithItem(ModalEnum.CREATE_BRAND);
      });

      expect(mockOpenModal).toHaveBeenCalledWith(ModalEnum.CREATE_BRAND);
    });

    it('sets selectedItem when item is provided', () => {
      const { result } = renderHook(() =>
        useModalState<{ id: string; name: string }>(),
      );

      act(() => {
        result.current.openModalWithItem(ModalEnum.CREATE_BRAND, {
          id: '123',
          name: 'Test',
        });
      });

      expect(result.current.selectedItem).toEqual({
        id: '123',
        name: 'Test',
      });
      expect(mockOpenModal).toHaveBeenCalledWith(ModalEnum.CREATE_BRAND);
    });

    it('sets modalData when data is provided', () => {
      const { result } = renderHook(() =>
        useModalState<unknown, { mode: string }>(),
      );

      act(() => {
        result.current.openModalWithItem(ModalEnum.CREATE_BRAND, undefined, {
          mode: 'edit',
        });
      });

      expect(result.current.modalData).toEqual({ mode: 'edit' });
    });

    it('sets both item and data when both are provided', () => {
      const { result } = renderHook(() =>
        useModalState<{ id: string }, { mode: string }>(),
      );

      act(() => {
        result.current.openModalWithItem(
          ModalEnum.CREATE_BRAND,
          { id: '456' },
          { mode: 'delete' },
        );
      });

      expect(result.current.selectedItem).toEqual({ id: '456' });
      expect(result.current.modalData).toEqual({ mode: 'delete' });
    });

    it('does not change selectedItem when item is undefined', () => {
      const { result } = renderHook(() => useModalState<{ id: string }>());

      act(() => {
        result.current.setSelectedItem({ id: 'existing' });
      });

      act(() => {
        result.current.openModalWithItem(ModalEnum.CREATE_BRAND);
      });

      // selectedItem should remain unchanged since no item was passed
      expect(result.current.selectedItem).toEqual({ id: 'existing' });
    });

    it('does not change modalData when data is undefined', () => {
      const { result } = renderHook(() =>
        useModalState<unknown, { action: string }>(),
      );

      act(() => {
        result.current.setModalData({ action: 'existing' });
      });

      act(() => {
        result.current.openModalWithItem(ModalEnum.CREATE_BRAND);
      });

      // modalData should remain unchanged
      expect(result.current.modalData).toEqual({ action: 'existing' });
    });
  });

  describe('closeModalAndReset', () => {
    it('resets selectedItem to null', () => {
      const { result } = renderHook(() => useModalState<{ id: string }>());

      act(() => {
        result.current.setSelectedItem({ id: '123' });
      });

      expect(result.current.selectedItem).not.toBeNull();

      act(() => {
        result.current.closeModalAndReset();
      });

      expect(result.current.selectedItem).toBeNull();
    });

    it('resets modalData to null', () => {
      const { result } = renderHook(() =>
        useModalState<unknown, { mode: string }>(),
      );

      act(() => {
        result.current.setModalData({ mode: 'edit' });
      });

      expect(result.current.modalData).not.toBeNull();

      act(() => {
        result.current.closeModalAndReset();
      });

      expect(result.current.modalData).toBeNull();
    });

    it('resets both selectedItem and modalData', () => {
      const { result } = renderHook(() =>
        useModalState<{ id: string }, { mode: string }>(),
      );

      act(() => {
        result.current.setSelectedItem({ id: '123' });
        result.current.setModalData({ mode: 'delete' });
      });

      act(() => {
        result.current.closeModalAndReset();
      });

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.modalData).toBeNull();
    });
  });

  describe('Type Safety', () => {
    it('works with complex item types', () => {
      interface ComplexItem {
        id: string;
        name: string;
        metadata: {
          createdAt: Date;
          tags: string[];
        };
      }

      const { result } = renderHook(() => useModalState<ComplexItem>());

      const item: ComplexItem = {
        id: '123',
        metadata: {
          createdAt: new Date(),
          tags: ['a', 'b'],
        },
        name: 'Complex',
      };

      act(() => {
        result.current.setSelectedItem(item);
      });

      expect(result.current.selectedItem).toEqual(item);
    });

    it('works with different data types', () => {
      interface ModalConfig {
        action: 'create' | 'edit' | 'delete';
        returnUrl: string;
      }

      const { result } = renderHook(() =>
        useModalState<unknown, ModalConfig>(),
      );

      const config: ModalConfig = {
        action: 'edit',
        returnUrl: '/dashboard',
      };

      act(() => {
        result.current.setModalData(config);
      });

      expect(result.current.modalData).toEqual(config);
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() => useModalState());

      expect(result.current).toHaveProperty('selectedItem');
      expect(result.current).toHaveProperty('modalData');
      expect(result.current).toHaveProperty('setSelectedItem');
      expect(result.current).toHaveProperty('setModalData');
      expect(result.current).toHaveProperty('openModalWithItem');
      expect(result.current).toHaveProperty('closeModalAndReset');
    });
  });
});
