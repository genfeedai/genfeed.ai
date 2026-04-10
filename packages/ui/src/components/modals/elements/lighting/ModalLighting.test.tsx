import { render, screen } from '@testing-library/react';
import ModalLighting from '@ui/modals/elements/lighting/ModalLighting';
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

describe('ModalLighting', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders lighting form', () => {
    render(<ModalLighting {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
