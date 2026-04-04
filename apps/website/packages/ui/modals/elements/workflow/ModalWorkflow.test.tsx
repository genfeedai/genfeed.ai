import { render, screen } from '@testing-library/react';
import ModalWorkflow from '@ui/modals/elements/workflow/ModalWorkflow';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock('@hooks/ui/use-crud-modal', () => ({
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

describe('ModalWorkflow', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders workflow form', () => {
    render(<ModalWorkflow {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
