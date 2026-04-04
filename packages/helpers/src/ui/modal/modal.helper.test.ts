import {
  closeModal,
  isModalOpen,
  openModal,
  subscribeModal,
  subscribeModalState,
} from '@helpers/ui/modal/modal.helper';
import { describe, expect, it, vi } from 'vitest';

describe('modal.helper (store-backed)', () => {
  it('returns false for invalid close id', () => {
    expect(closeModal('')).toBe(false);
  });

  it('opens and closes modal state by id', () => {
    const modalId = 'modal-test-state';

    expect(isModalOpen(modalId)).toBe(false);

    openModal(modalId);
    expect(isModalOpen(modalId)).toBe(true);

    expect(closeModal(modalId)).toBe(true);
    expect(isModalOpen(modalId)).toBe(false);
  });

  it('notifies global subscribers when modal state changes', () => {
    const modalId = 'modal-test-global-sub';
    const listener = vi.fn();
    const unsubscribe = subscribeModalState(listener);

    openModal(modalId);
    closeModal(modalId);

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('notifies modal-specific subscribers only for the same id', () => {
    const modalA = 'modal-test-a';
    const modalB = 'modal-test-b';
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubscribeA = subscribeModal(modalA, listenerA);
    const unsubscribeB = subscribeModal(modalB, listenerB);

    openModal(modalA);
    closeModal(modalA);

    expect(listenerA).toHaveBeenCalledTimes(2);
    expect(listenerB).not.toHaveBeenCalled();

    unsubscribeA();
    unsubscribeB();
  });
});
