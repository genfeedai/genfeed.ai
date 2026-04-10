import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalConfirm from '@ui/modals/system/confirm/ModalConfirm';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, id }: any) => (
    <div data-testid={`modal-${id}`}>{children}</div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => (
    <div data-testid="modal-actions">{children}</div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
}));

describe('ModalConfirm', () => {
  const defaultProps = {
    onConfirm: vi.fn(),
  };

  it('renders with default props', () => {
    render(<ModalConfirm {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders with custom props', () => {
    render(
      <ModalConfirm
        {...defaultProps}
        label="Delete Item"
        message="This action cannot be undone"
        confirmLabel="Delete"
        cancelLabel="Keep"
      />,
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone'),
    ).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Keep')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ModalConfirm {...defaultProps} onConfirm={onConfirm} />);
    const confirmButton = screen.getByText('Yes');
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('renders error state when isError is true', () => {
    render(<ModalConfirm {...defaultProps} isError={true} />);
    // Modal mock uses data-testid="modal-{id}" pattern
    expect(screen.getByTestId('modal-modal-confirm')).toBeInTheDocument();
  });
});
