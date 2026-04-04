import { render, screen } from '@testing-library/react';
import ModalCameraMovement from '@ui/modals/elements/camera-movement/ModalCameraMovement';
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

describe('ModalCameraMovement', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders camera movement form', () => {
    render(<ModalCameraMovement {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
