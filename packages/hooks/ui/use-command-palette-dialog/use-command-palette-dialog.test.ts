import { useCommandPaletteDialog } from '@hooks/ui/use-command-palette-dialog/use-command-palette-dialog';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('useCommandPaletteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('opens modal via store when isOpen is true', () => {
    vi.mocked(isModalOpen).mockReturnValue(false);
    const onAfterOpen = vi.fn();

    renderHook(() =>
      useCommandPaletteDialog({
        isOpen: true,
        modalId: 'command-palette',
        onAfterOpen,
      }),
    );

    expect(openModal).toHaveBeenCalledWith('command-palette');
    expect(onAfterOpen).toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();
  });

  it('closes modal via store when isOpen is false', () => {
    vi.mocked(isModalOpen).mockReturnValue(true);

    renderHook(() =>
      useCommandPaletteDialog({
        isOpen: false,
        modalId: 'command-palette',
      }),
    );

    expect(closeModal).toHaveBeenCalledWith('command-palette');
    expect(openModal).not.toHaveBeenCalled();
  });

  it('does not call openModal when already open', () => {
    vi.mocked(isModalOpen).mockReturnValue(true);
    const onAfterOpen = vi.fn();

    renderHook(() =>
      useCommandPaletteDialog({
        isOpen: true,
        modalId: 'command-palette',
        onAfterOpen,
      }),
    );

    expect(openModal).not.toHaveBeenCalled();
    expect(onAfterOpen).not.toHaveBeenCalled();
  });

  it('does not call closeModal when already closed', () => {
    vi.mocked(isModalOpen).mockReturnValue(false);

    renderHook(() =>
      useCommandPaletteDialog({
        isOpen: false,
        modalId: 'command-palette',
      }),
    );

    expect(closeModal).not.toHaveBeenCalled();
    expect(openModal).not.toHaveBeenCalled();
  });

  it('closes modal on unmount when open', () => {
    vi.mocked(isModalOpen).mockReturnValue(false);

    const { unmount } = renderHook(() =>
      useCommandPaletteDialog({
        isOpen: true,
        modalId: 'command-palette',
      }),
    );

    expect(openModal).toHaveBeenCalledWith('command-palette');
    vi.clearAllMocks();

    vi.mocked(isModalOpen).mockReturnValue(true);
    unmount();

    expect(closeModal).toHaveBeenCalledWith('command-palette');
  });

  it('does not close modal on unmount when already closed', () => {
    vi.mocked(isModalOpen).mockReturnValue(false);

    const { unmount } = renderHook(() =>
      useCommandPaletteDialog({
        isOpen: false,
        modalId: 'command-palette',
      }),
    );

    vi.clearAllMocks();
    vi.mocked(isModalOpen).mockReturnValue(false);
    unmount();

    expect(closeModal).not.toHaveBeenCalled();
  });
});
