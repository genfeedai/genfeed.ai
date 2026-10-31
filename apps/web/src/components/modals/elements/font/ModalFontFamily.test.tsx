import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalFontFamily from '@/components/modals/elements/font/ModalFontFamily';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({
    children,
  }: import('react').ComponentProps<
    typeof import('@ui/modals/modal/Modal').default
  >) => <div data-testid="modal">{children}</div>,
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

describe('ModalFontFamily', () => {
  const defaultProps = {
    item: null,
    onConfirm: vi.fn(),
  };

  it('renders font family form', () => {
    render(<ModalFontFamily {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
