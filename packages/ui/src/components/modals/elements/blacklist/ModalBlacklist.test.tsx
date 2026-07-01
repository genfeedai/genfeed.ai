import { render, screen } from '@testing-library/react';
import ModalBlacklist from '@ui/modals/elements/blacklist/ModalBlacklist';
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
      handleSubmit: vi.fn((fn) => fn),
      register: vi.fn(),
      setValue: vi.fn(),
      watch: vi.fn(() => ''),
    },
    formRef: { current: null },
    handleDelete: vi.fn(),
    isSubmitting: false,
    onSubmit: vi.fn(),
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () =>
    Promise.resolve({
      create: vi.fn(),
      update: vi.fn(),
    }),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useUser: () => ({
    user: {
      publicMetadata: {},
    },
  }),
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
  default: ({ children }: any) => <div>{children}</div>,
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

describe('ModalBlacklist', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders blacklist form', () => {
    render(<ModalBlacklist {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
