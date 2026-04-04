import { render, screen } from '@testing-library/react';
import ModalCredential from '@ui/modals/system/credential/ModalCredential';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

vi.mock('@hooks/ui/use-crud-modal/use-crud-modal', () => ({
  useCrudModal: () => ({
    closeModal: vi.fn(),
    form: {
      control: {},
      formState: { errors: {}, isValid: false },
      getValues: vi.fn(),
      handleSubmit: vi.fn((fn: Function) => fn),
      register: vi.fn(),
      reset: vi.fn(),
      setValue: vi.fn(),
      watch: vi.fn(() => ''),
    },
    formRef: { current: null },
    handleDelete: vi.fn(),
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: vi.fn(),
}));

vi.mock('@ui/forms/inputs/input/form-input/FormInput', () => ({
  default: (props: any) => <input data-testid={`input-${props.name}`} />,
}));

vi.mock('@ui/forms/inputs/textarea/form-textarea/FormTextarea', () => ({
  default: (props: any) => <textarea data-testid={`textarea-${props.name}`} />,
}));

vi.mock('@ui/forms/base/form-control/FormControl', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@helpers/ui/form-error/form-error.helper', () => ({
  hasFormErrors: () => false,
  parseFormErrors: () => [],
}));

describe('ModalCredential', () => {
  const defaultProps = {
    credential: null,
    onConfirm: vi.fn(),
  };

  it('renders credential form', () => {
    render(<ModalCredential {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders with existing credential', () => {
    const credential = {
      id: 'cred-1',
      label: 'Test Credential',
      platform: 'instagram',
      username: 'testuser',
    };
    render(
      <ModalCredential {...defaultProps} credential={credential as any} />,
    );
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
