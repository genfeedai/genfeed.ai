import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { modalStore } = vi.hoisted(() => ({
  modalStore: {
    listeners: new Map<string, Set<() => void>>(),
    open: new Set<string>(),
  },
}));

vi.mock('@helpers/ui/modal/modal.helper', () => {
  const notify = (modalId: string) => {
    for (const listener of modalStore.listeners.get(modalId) ?? []) {
      listener();
    }
  };

  return {
    closeModal: vi.fn((modalId: string) => {
      const wasOpen = modalStore.open.delete(modalId);
      notify(modalId);
      return wasOpen;
    }),
    isModalOpen: vi.fn((modalId: string) => modalStore.open.has(modalId)),
    openModal: vi.fn((modalId: string) => {
      modalStore.open.add(modalId);
      notify(modalId);
      return true;
    }),
    subscribeModal: vi.fn((modalId: string, listener: () => void) => {
      const existing = modalStore.listeners.get(modalId) ?? new Set();
      existing.add(listener);
      modalStore.listeners.set(modalId, existing);
      return () => {
        existing.delete(listener);
      };
    }),
  };
});

import {
  closeModal,
  isModalOpen,
  openModal,
  subscribeModal,
} from '@helpers/ui/modal/modal.helper';
import { useModal } from './use-modal';

describe('useModal', () => {
  const modalId = 'test-modal';

  beforeEach(() => {
    vi.clearAllMocks();
    modalStore.open.clear();
    modalStore.listeners.clear();
  });

  it('initializes with closed state', () => {
    const { result } = renderHook(() => useModal(modalId));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.modalRef.current).toBeNull();
  });

  it('opens the modal', () => {
    const { result } = renderHook(() => useModal(modalId));

    act(() => {
      result.current.open();
    });

    expect(openModal).toHaveBeenCalledWith(modalId);
    expect(result.current.isOpen).toBe(true);
  });

  it('closes the modal', () => {
    const { result } = renderHook(() => useModal(modalId));

    act(() => {
      result.current.open();
    });
    act(() => {
      result.current.close();
    });

    expect(closeModal).toHaveBeenCalledWith(modalId);
    expect(result.current.isOpen).toBe(false);
  });

  it('toggles from closed to open and back', () => {
    const { result } = renderHook(() => useModal(modalId));

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
    expect(openModal).toHaveBeenCalledWith(modalId);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
    expect(closeModal).toHaveBeenCalledWith(modalId);
  });

  it('invokes onOpen when the modal transitions to open', () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useModal(modalId, { onOpen }));

    act(() => {
      result.current.open();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when the modal transitions to closed', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useModal(modalId, { onClose }));

    act(() => {
      result.current.open();
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      result.current.close();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reflects external open state changes from the helper store', () => {
    const { result } = renderHook(() => useModal(modalId));

    act(() => {
      openModal(modalId);
    });

    expect(result.current.isOpen).toBe(true);
    expect(isModalOpen(modalId)).toBe(true);
  });

  it('uses the latest options after a rerender', () => {
    const firstOnOpen = vi.fn();
    const secondOnOpen = vi.fn();
    const { rerender, result } = renderHook(
      ({ onOpen }: { onOpen: () => void }) => useModal(modalId, { onOpen }),
      { initialProps: { onOpen: firstOnOpen } },
    );

    rerender({ onOpen: secondOnOpen });

    act(() => {
      result.current.open();
    });

    expect(firstOnOpen).not.toHaveBeenCalled();
    expect(secondOnOpen).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from the store on unmount', () => {
    const { unmount } = renderHook(() => useModal(modalId));

    expect(subscribeModal).toHaveBeenCalled();
    expect(modalStore.listeners.get(modalId)?.size).toBe(1);

    unmount();

    expect(modalStore.listeners.get(modalId)?.size).toBe(0);
  });
});
