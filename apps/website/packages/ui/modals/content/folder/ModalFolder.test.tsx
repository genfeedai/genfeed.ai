import { render, screen } from '@testing-library/react';
import ModalFolder from '@ui/modals/content/folder/ModalFolder';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
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

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: [],
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    currentApp: 'app',
  },
}));

vi.mock('@ui/forms/inputs/input/form-input/FormInput', () => ({
  default: (props: any) => <input data-testid={`input-${props.name}`} />,
}));

vi.mock('@ui/forms/inputs/textarea/form-textarea/FormTextarea', () => ({
  default: (props: any) => <textarea data-testid={`textarea-${props.name}`} />,
}));

vi.mock('@ui/forms/selectors/select/form-select/FormSelect', () => ({
  default: (props: any) => <select data-testid={`select-${props.name}`} />,
}));

vi.mock('@ui/forms/base/form-control/FormControl', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

vi.mock('@helpers/ui/form-error/form-error.helper', () => ({
  hasFormErrors: () => false,
  parseFormErrors: () => [],
}));

describe('ModalFolder', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders folder form', () => {
    render(<ModalFolder {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders with existing folder', () => {
    const folder = {
      id: 'folder-1',
      label: 'Test Folder',
    };
    render(<ModalFolder {...defaultProps} item={folder as any} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
