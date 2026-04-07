import type { ModalProps } from '@props/modals/modal.props';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalTrainingNew from '@ui/modals/trainings/ModalTrainingNew';
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
  default: ({ label, children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {label || children}
    </button>
  ),
}));

vi.mock('@ui/forms/base/form-control/FormControl', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="form-control">{children}</div>
  ),
}));

vi.mock('@ui/forms/inputs/input/form-input/FormInput', () => ({
  __esModule: true,
  default: () => <input data-testid="form-input" />,
}));

vi.mock('@ui/forms/selectors/dropdown/form-dropdown/FormDropdown', () => ({
  __esModule: true,
  default: () => <select data-testid="form-dropdown" />,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  default: () => () =>
    Promise.resolve({
      create: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    }),
  useAuthedService: () => () =>
    Promise.resolve({
      create: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
    }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  __esModule: true,
  useSocketManager: () => ({
    isReady: false,
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('@hooks/utils/use-form-submit/use-form-submit', () => ({
  __esModule: true,
  useFormSubmitWithState: () => ({
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('react-dropzone', () => ({
  __esModule: true,
  useDropzone: () => ({
    getInputProps: () => ({}),
    getRootProps: () => ({}),
    isDragActive: false,
  }),
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    formState: { errors: {}, isValid: true },
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(() => ''),
  }),
}));

describe('ModalTrainingNew', () => {
  const defaultProps = {
    onConfirm: vi.fn(),
  };

  it('renders training form', () => {
    render(<ModalTrainingNew {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
