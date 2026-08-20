import { render, screen } from '@testing-library/react';
import ModalSound from '@ui/modals/elements/sound/ModalSound';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal">{children}</div>
  ),
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
      watch: vi.fn(() => false),
    },
    formRef: { current: null },
    handleDelete: vi.fn(),
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useUser: () => ({
    user: {
      publicMetadata: {},
    },
  }),
}));

vi.mock('@genfeedai/helpers/auth/auth.helper', () => ({
  getAuthPublicData: () => ({ isSuperAdmin: false }),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => ({
      accessState: null,
      canAccessApp: true,
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      needsOnboarding: false,
      refreshAccessState: vi.fn(),
    }),
  }),
);

vi.mock('@ui/modals/actions/ModalActions', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: { name?: string }) => (
    <input data-testid={`input-${props.name ?? 'unknown'}`} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  SelectField: (props: { name?: string }) => (
    <select data-testid={`select-${props.name ?? 'unknown'}`} />
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: (props: { control?: object; name?: string }) => (
    <input
      type="checkbox"
      data-testid={`checkbox-${props.name ?? 'unknown'}`}
      data-controlled={props.control ? 'true' : 'false'}
    />
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ label, onClick }: { label?: string; onClick?: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
  buttonVariants: () => '',
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

  it('binds auto-select to the sound form control', () => {
    render(<ModalSound {...defaultProps} />);

    expect(screen.getByTestId('checkbox-isActive')).toHaveAttribute(
      'data-controlled',
      'true',
    );
  });
});
