import { render, screen } from '@testing-library/react';
import ModalSound from '@ui/modals/elements/sound/ModalSound';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
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
      watch: vi.fn(() => false),
    },
    formRef: { current: null },
    handleDelete: vi.fn(),
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      publicMetadata: {},
    },
  }),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  getClerkPublicData: () => ({ isSuperAdmin: false }),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@ui/forms/inputs/input/form-input/FormInput', () => ({
  default: (props: any) => <input data-testid={`input-${props.name}`} />,
}));

vi.mock('@ui/forms/selectors/select/form-select/FormSelect', () => ({
  default: (props: any) => <select data-testid={`select-${props.name}`} />,
}));

vi.mock('@ui/forms/selectors/checkbox/form-checkbox/FormCheckbox', () => ({
  default: (props: any) => (
    <input type="checkbox" data-testid={`checkbox-${props.name}`} />
  ),
}));

vi.mock('@ui/forms/base/form-control/FormControl', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

describe('ModalSound', () => {
  const defaultProps = {
    onConfirm: vi.fn(),
    sound: null,
  };

  it('renders sound form', () => {
    render(<ModalSound {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
