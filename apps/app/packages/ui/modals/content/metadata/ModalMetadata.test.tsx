import type { ModalProps } from '@props/modals/modal.props';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import ModalMetadata from '@ui/modals/content/metadata/ModalMetadata';
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
  default: ({ label, children, onClick }: BaseButtonProps) => (
    <button type="button" onClick={onClick}>
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

vi.mock('@ui/forms/inputs/textarea/form-textarea/FormTextarea', () => ({
  __esModule: true,
  default: () => <textarea data-testid="form-textarea" />,
}));

vi.mock('@ui/forms/selectors/select/form-select/FormSelect', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => (
    <select data-testid="form-select">{children}</select>
  ),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  __esModule: true,
  default: () => () =>
    Promise.resolve({
      findAll: vi.fn().mockResolvedValue([]),
      updateMetadata: vi.fn(),
    }),
  useAuthedService: () => () =>
    Promise.resolve({
      findAll: vi.fn().mockResolvedValue([]),
      updateMetadata: vi.fn(),
    }),
}));

vi.mock('@hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  __esModule: true,
  useModalAutoOpen: () => undefined,
}));

vi.mock('@hooks/utils/use-form-submit/use-form-submit', () => ({
  __esModule: true,
  useFormSubmitWithState: () => ({
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    formState: { errors: {}, isValid: true },
    getValues: vi.fn(() => ({})),
    handleSubmit: vi.fn((fn) => fn),
    register: vi.fn(),
    reset: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(() => ''),
  }),
}));

describe('ModalMetadata', () => {
  const defaultProps = {
    ingredientCategory: 'video',
    ingredientId: 'ingredient-1',
    onConfirm: vi.fn(),
  };

  it('renders metadata form', () => {
    render(<ModalMetadata {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
