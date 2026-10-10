import { ModalEnum } from '@genfeedai/contracts';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalConfirm from '@ui/modals/system/confirm/ModalConfirm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({
    children,
  }: import('react').ComponentProps<
    typeof import('@ui/modals/actions/ModalActions').default
  >) => <div data-testid="modal-actions">{children}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    label,
    onClick,
  }: import('react').ComponentProps<
    typeof import('@ui/buttons/base/Button').default
  >) => <button onClick={onClick}>{label}</button>,
}));

describe('ModalConfirm', () => {
  beforeEach(() => {
    act(() => openModal(ModalEnum.CONFIRM));
  });

  afterEach(() => {
    act(() => closeModal(ModalEnum.CONFIRM));
  });

  const defaultProps = {
    onConfirm: vi.fn(),
  };

  it('renders with default props', () => {
    render(<ModalConfirm {...defaultProps} />);
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Confirm', level: 3 }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole('dialog', { name: 'Delete Item' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Delete Item', level: 3 }),
    ).toBeInTheDocument();
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

  it('settles the confirmation once when Escape dismisses it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ModalConfirm
        {...defaultProps}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not settle Cancel a second time when the dialog then closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn(() => closeModal(ModalEnum.CONFIRM));
    render(<ModalConfirm {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not settle a confirmed dialog as dismissed when it closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn(() => {
      closeModal(ModalEnum.CONFIRM);
    });
    render(
      <ModalConfirm
        {...defaultProps}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByText('Yes'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders error state when isError is true', () => {
    render(<ModalConfirm {...defaultProps} isError={true} />);
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();
  });
});
