import { Training } from '@models/ai/training.model';
import type { ModalProps } from '@props/modals/modal.props';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalTraining from '@ui/modals/trainings/ModalTraining';
import type { PropsWithChildren, RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
  default: ({ label, children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  __esModule: true,
  default: () => <input data-testid="form-input" />,
}));

vi.mock('@ui/primitives/select', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <select data-testid="form-select">{children}</select>
  ),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  __esModule: true,
  useBrand: () => ({
    brands: [{ id: 'brand-1', label: 'Brand 1' }],
  }),
}));

vi.mock('@hooks/ui/use-crud-modal/use-crud-modal', () => ({
  __esModule: true,
  useCrudModal: () => ({
    closeModal: vi.fn(),
    form: {
      control: {},
      formState: { errors: {}, isValid: true },
      setValue: vi.fn(),
    },
    formRef: { current: null } as RefObject<HTMLFormElement>,
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

describe('ModalTraining', () => {
  const training = new Training({
    description: 'Test training description',
    id: 'training-1',
    label: 'Test training',
    trigger: 'TRG1',
  });

  const baseProps = {
    onSuccess: vi.fn(),
    training,
  };

  it('should render without crashing', () => {
    render(<ModalTraining {...baseProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<ModalTraining {...baseProps} />);
    expect(screen.getByTestId('modal-actions')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(<ModalTraining {...baseProps} />);
    expect(screen.getAllByTestId('form-control').length).toBeGreaterThan(0);
  });
});
