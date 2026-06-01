import { render, screen } from '@testing-library/react';
import ModalStyle from '@ui/modals/elements/style/ModalStyle';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal', () => ({
  useCrudModal: () => ({
    closeModal: vi.fn(),
    form: {
      control: {},
      formState: { errors: {}, isValid: false },
      getValues: vi.fn(),
      handleSubmit: vi.fn((fn: (...args: never[]) => unknown) => fn),
      register: vi.fn(),
      reset: vi.fn(),
      setValue: vi.fn(),
      trigger: vi.fn(),
      watch: vi.fn(() => ''),
    },
    formRef: { current: null },
    handleDelete: vi.fn(),
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: { name?: string }) => (
    <input data-testid={`input-${props.name ?? 'unknown'}`} />
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: (props: { name?: string }) => (
    <input
      type="checkbox"
      data-testid={`checkbox-${props.name ?? 'unknown'}`}
    />
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ label, onClick }: { label?: string; onClick?: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
  buttonVariants: () => '',
}));

describe('ModalStyle', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders style form', () => {
    render(<ModalStyle {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
