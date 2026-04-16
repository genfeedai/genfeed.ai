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

vi.mock('@ui/primitives/button', () => ({
  Button: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal', () => ({
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

vi.mock('@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: vi.fn(),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: any) => <input data-testid={`input-${props.name}`} />,
  default: (props: any) => <input data-testid={`input-${props.name}`} />,
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: any) => <textarea data-testid={`textarea-${props.name}`} />,
  default: (props: any) => <textarea data-testid={`textarea-${props.name}`} />,
}));

vi.mock('@ui/primitives/field', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@genfeedai/helpers/ui/form-error/form-error.helper', () => ({
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
