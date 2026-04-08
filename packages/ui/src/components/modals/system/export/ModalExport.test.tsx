import type { ModalProps } from '@props/modals/modal.props';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalExport from '@ui/modals/system/export/ModalExport';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  __esModule: true,
  default: ({ children }: ModalProps) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal-actions">{children}</div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  __esModule: true,
  default: ({ label, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label}
    </button>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <select data-testid="form-select">{children}</select>
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  __esModule: true,
  default: () => <div data-testid="form-checkbox" />,
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  __esModule: true,
  closeModal: vi.fn(),
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    formState: { errors: {} },
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(() => 'csv'),
  }),
}));

describe('ModalExport', () => {
  const defaultProps = {
    onExport: vi.fn(),
  };

  it('renders export modal', () => {
    render(<ModalExport {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders format options', () => {
    render(<ModalExport {...defaultProps} />);
    expect(screen.getAllByText(/csv/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/xlsx/i).length).toBeGreaterThan(0);
  });
});
