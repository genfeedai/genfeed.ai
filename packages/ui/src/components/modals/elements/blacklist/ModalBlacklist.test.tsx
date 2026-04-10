import { render, screen } from '@testing-library/react';
import ModalBlacklist from '@ui/modals/elements/blacklist/ModalBlacklist';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@genfeedai/hooks/ui/use-crud-modal', () => ({
  useCrudModal: () => ({
    form: {
      formState: { errors: {} },
      handleSubmit: vi.fn((fn) => fn),
      register: vi.fn(),
      setValue: vi.fn(),
      watch: vi.fn(() => ''),
    },
    handleDelete: vi.fn(),
    isSubmitting: false,
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () =>
    Promise.resolve({
      create: vi.fn(),
      update: vi.fn(),
    }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      publicMetadata: {},
    },
  }),
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
