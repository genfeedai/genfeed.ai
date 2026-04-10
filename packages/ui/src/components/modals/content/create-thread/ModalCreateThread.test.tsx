import { render, screen } from '@testing-library/react';
import ModalCreateThread from '@ui/modals/content/create-thread/ModalCreateThread';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

describe('ModalCreateThread', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  it('renders create thread modal', () => {
    render(<ModalCreateThread {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders the shared segmented tab labels', () => {
    render(<ModalCreateThread {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Compose' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Preview/i })).toBeInTheDocument();
  });
});
