import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openModal = vi.fn();
const closeModal = vi.fn();

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: (...args: unknown[]) => closeModal(...args),
  openModal: (...args: unknown[]) => openModal(...args),
}));

describe('useModalAutoOpen', () => {
  let originalRaf: typeof requestAnimationFrame | undefined;
  let originalCancel: typeof cancelAnimationFrame | undefined;
  let rafId = 0;
  const cancelSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('closes the modal when isOpen is false', () => {
    renderHook(() => useModalAutoOpen('modal-id', { isOpen: false }));

    expect(closeModal).toHaveBeenCalledWith('modal-id');
  });

  it('cancels animation frames on cleanup', () => {
    const { unmount } = renderHook(() =>
      useModalAutoOpen('modal-id', { isOpen: true }),
    );

    unmount();

    expect(cancelSpy).toHaveBeenCalledTimes(2);
  });
});
