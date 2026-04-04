import { useModal } from '@hooks/ui/use-modal/use-modal';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the modal helper functions
vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  isModalOpen: vi.fn(),
  openModal: vi.fn(),
}));

import {
  closeModal,
  isModalOpen,
  openModal,
} from '@helpers/ui/modal/modal.helper';

const mockOpenModal = vi.mocked(openModal);
const mockCloseModal = vi.mocked(closeModal);
const mockIsModalOpen = vi.mocked(isModalOpen);

describe.skip('useModal', () => {
  const modalId = 'test-modal';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock MutationObserver
    global.MutationObserver = vi.fn().mockImplementation(() => ({
      disconnect: vi.fn(),
      observe: vi.fn(),
    }));
    // Mock DOM methods
    document.getElementById = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      getBoundingClientRect: vi.fn().mockReturnValue({
        height: 100,
        left: 0,
        top: 0,
        width: 100,
      }),
      hasAttribute: vi.fn().mockReturnValue(false),
      open: false,
      removeEventListener: vi.fn(),
    });
    document.addEventListener = vi.fn();
    document.removeEventListener = vi.fn();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('initializes with closed state', () => {
    mockIsModalOpen.mockReturnValue(false);

    const { result } = renderHook(() => useModal(modalId));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.modalRef.current).toBeNull();
  });

  it('initializes with open state when modal is already open', () => {
    mockIsModalOpen.mockReturnValue(true);

    const { result } = renderHook(() => useModal(modalId));

    expect(result.current.isOpen).toBe(true);
  });

  it('opens modal successfully', () => {
    mockOpenModal.mockReturnValue(true);
    mockIsModalOpen.mockReturnValue(true);

    const { result } = renderHook(() => useModal(modalId));

    act(() => {
      result.current.open();
    });

    expect(mockOpenModal).toHaveBeenCalledWith(modalId);
    expect(result.current.isOpen).toBe(true);
  });

  it('closes modal successfully', () => {
    mockCloseModal.mockReturnValue(true);
    mockIsModalOpen.mockReturnValue(false);

    const { result } = renderHook(() => useModal(modalId));

    act(() => {
      result.current.close();
    });

    expect(mockCloseModal).toHaveBeenCalledWith(modalId);
    expect(result.current.isOpen).toBe(false);
  });

  it('toggles modal state', () => {
    mockIsModalOpen.mockReturnValue(false);
    mockOpenModal.mockReturnValue(true);

    const { result } = renderHook(() => useModal(modalId));

    act(() => {
      result.current.toggle();
    });

    expect(mockOpenModal).toHaveBeenCalledWith(modalId);
  });

  it('calls onOpen callback when modal opens', () => {
    const onOpen = vi.fn();
    mockOpenModal.mockReturnValue(true);
    mockIsModalOpen.mockReturnValue(true);

    const { result } = renderHook(() => useModal(modalId, { onOpen }));

    act(() => {
      result.current.open();
    });

    expect(onOpen).toHaveBeenCalled();
  });

  it('calls onClose callback when modal closes', () => {
    const onClose = vi.fn();
    mockCloseModal.mockReturnValue(true);
    mockIsModalOpen.mockReturnValue(false);

    const { result } = renderHook(() => useModal(modalId, { onClose }));

    act(() => {
      result.current.close();
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('handles escape key press', () => {
    mockIsModalOpen.mockReturnValue(true);
    mockCloseModal.mockReturnValue(true);

    const { result } = renderHook(() => useModal(modalId));

    // Simulate escape key press
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    act(() => {
      document.dispatchEvent(escapeEvent);
    });

    expect(mockCloseModal).toHaveBeenCalledWith(modalId);
  });

  it('does not close on escape when closeOnEscape is false', () => {
    mockIsModalOpen.mockReturnValue(true);

    renderHook(() => useModal(modalId, { closeOnEscape: false }));

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    act(() => {
      document.dispatchEvent(escapeEvent);
    });

    expect(mockCloseModal).not.toHaveBeenCalled();
  });

  it('handles click outside modal', () => {
    mockIsModalOpen.mockReturnValue(true);
    mockCloseModal.mockReturnValue(true);

    const mockDialog = {
      addEventListener: vi.fn(),
      getBoundingClientRect: vi.fn().mockReturnValue({
        height: 100,
        left: 0,
        top: 0,
        width: 100,
      }),
      open: true,
      removeEventListener: vi.fn(),
    };

    document.getElementById = vi.fn().mockReturnValue(mockDialog);

    const { result } = renderHook(() => useModal(modalId));

    // Simulate click outside modal
    const clickEvent = new MouseEvent('click', {
      clientX: 200,
      clientY: 200,
    });

    act(() => {
      mockDialog.addEventListener.mock.calls.find(
        (call) => call[0] === 'click',
      )?.[1](clickEvent);
    });

    expect(mockCloseModal).toHaveBeenCalledWith(modalId);
  });

  it('does not close on click outside when closeOnClickOutside is false', () => {
    mockIsModalOpen.mockReturnValue(true);

    const mockDialog = {
      addEventListener: vi.fn(),
      getBoundingClientRect: vi.fn().mockReturnValue({
        height: 100,
        left: 0,
        top: 0,
        width: 100,
      }),
      open: true,
      removeEventListener: vi.fn(),
    };

    document.getElementById = vi.fn().mockReturnValue(mockDialog);

    renderHook(() => useModal(modalId, { closeOnClickOutside: false }));

    // Simulate click outside modal
    const clickEvent = new MouseEvent('click', {
      clientX: 200,
      clientY: 200,
    });

    act(() => {
      mockDialog.addEventListener.mock.calls.find(
        (call) => call[0] === 'click',
      )?.[1](clickEvent);
    });

    expect(mockCloseModal).not.toHaveBeenCalled();
  });

  it('handles dialog close event', () => {
    const onClose = vi.fn();
    mockIsModalOpen.mockReturnValue(false);

    const mockDialog = {
      addEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(),
      open: false,
      removeEventListener: vi.fn(),
    };

    document.getElementById = vi.fn().mockReturnValue(mockDialog);

    const { result } = renderHook(() => useModal(modalId, { onClose }));

    // Simulate dialog close event
    act(() => {
      mockDialog.addEventListener.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1]();
    });

    expect(result.current.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('handles dialog open event', () => {
    const onOpen = vi.fn();
    mockIsModalOpen.mockReturnValue(true);

    const mockDialog = {
      addEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(),
      open: true,
      removeEventListener: vi.fn(),
    };

    document.getElementById = vi.fn().mockReturnValue(mockDialog);

    const { result } = renderHook(() => useModal(modalId, { onOpen }));

    // Simulate dialog open event
    act(() => {
      mockDialog.addEventListener.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1]();
    });

    expect(result.current.isOpen).toBe(true);
    expect(onOpen).toHaveBeenCalled();
  });

  it('cleans up event listeners on unmount', () => {
    const mockDialog = {
      addEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(),
      open: false,
      removeEventListener: vi.fn(),
    };

    document.getElementById = vi.fn().mockReturnValue(mockDialog);
    document.removeEventListener = vi.fn();

    const { unmount } = renderHook(() => useModal(modalId));

    unmount();

    expect(document.removeEventListener).toHaveBeenCalled();
    expect(mockDialog.removeEventListener).toHaveBeenCalled();
  });

  it('updates options when they change', () => {
    const onOpen1 = vi.fn();
    const onOpen2 = vi.fn();
    mockOpenModal.mockReturnValue(true);
    mockIsModalOpen.mockReturnValue(true);

    const { result, rerender } = renderHook(
      ({ options }) => useModal(modalId, options),
      { initialProps: { options: { onOpen: onOpen1 } } },
    );

    act(() => {
      result.current.open();
    });

    expect(onOpen1).toHaveBeenCalled();

    rerender({ options: { onOpen: onOpen2 } });

    act(() => {
      result.current.open();
    });

    expect(onOpen2).toHaveBeenCalled();
  });
});
