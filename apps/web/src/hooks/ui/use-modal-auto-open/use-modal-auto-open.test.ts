import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalAutoOpen } from '@/hooks/ui/use-modal-auto-open/use-modal-auto-open';

const openModals = new Set<string>();
const openModal = vi.fn((id: string) => {
  openModals.add(id);
});
const closeModal = vi.fn((id: string) => {
  openModals.delete(id);
});

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: (id: string) => closeModal(id),
  openModal: (id: string) => openModal(id),
}));

describe('useModalAutoOpen', () => {
  let originalRaf: typeof requestAnimationFrame | undefined;
  let originalCancel: typeof cancelAnimationFrame | undefined;
  let rafId = 0;
  const cancelSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    openModals.clear();
    rafId = 0;
    originalRaf = globalThis.requestAnimationFrame;
    originalCancel = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      rafId += 1;
      callback(0);
      return rafId;
    }) as typeof requestAnimationFrame;

    globalThis.cancelAnimationFrame =
      cancelSpy as unknown as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    if (typeof originalRaf === 'undefined') {
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    } else {
      globalThis.requestAnimationFrame = originalRaf;
    }

    if (typeof originalCancel === 'undefined') {
      Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
    } else {
      globalThis.cancelAnimationFrame = originalCancel;
    }
  });

  it('opens the modal when isOpen is true', () => {
    renderHook(() => useModalAutoOpen('modal-id', { isOpen: true }));

    expect(openModal).toHaveBeenCalledWith('modal-id');
    expect([...openModals]).toEqual(['modal-id']);
  });

  it('closes the modal when isOpen is false', () => {
    openModals.add('modal-id');
    renderHook(() => useModalAutoOpen('modal-id', { isOpen: false }));

    expect(closeModal).toHaveBeenCalledWith('modal-id');
    expect(openModals.size).toBe(0);
  });

  it('closes an open modal when isOpen turns false', () => {
    const { rerender } = renderHook(
      ({ isOpen }) => useModalAutoOpen('modal-id', { isOpen }),
      { initialProps: { isOpen: true } },
    );
    expect(openModals.has('modal-id')).toBe(true);

    rerender({ isOpen: false });

    expect(openModals.has('modal-id')).toBe(false);
  });

  it('reopens the modal when openKey changes while open', () => {
    const { rerender } = renderHook(
      ({ openKey }) => useModalAutoOpen('modal-id', { isOpen: true, openKey }),
      { initialProps: { openKey: 0 } },
    );

    expect(openModal).toHaveBeenCalledTimes(1);

    rerender({ openKey: 1 });

    expect(openModal).toHaveBeenCalledTimes(2);
    expect([...openModals]).toEqual(['modal-id']);
  });

  it('cancels animation frames on cleanup', () => {
    const { unmount } = renderHook(() =>
      useModalAutoOpen('modal-id', { isOpen: true }),
    );

    unmount();

    expect(cancelSpy).toHaveBeenCalledTimes(2);
  });
});
