import { render, screen } from '@testing-library/react';
import ModalMusic from '@ui/modals/ingredients/music/ModalMusic';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () =>
    vi.fn(() =>
      Promise.resolve({
        findAll: vi.fn(() => Promise.resolve([])),
      }),
    ),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

describe('ModalMusic', () => {
  const defaultProps = {
    brandId: 'brand-1',
    id: 'modal-music',
    onConfirm: vi.fn(),
    selectedMusicId: '',
  };

  it('renders music selection modal', () => {
    render(<ModalMusic {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
