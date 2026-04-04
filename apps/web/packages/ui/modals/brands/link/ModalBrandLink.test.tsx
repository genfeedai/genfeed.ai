import { render, screen } from '@testing-library/react';
import ModalBrandLink from '@ui/modals/brands/link/ModalBrandLink';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

describe('ModalBrandLink', () => {
  const defaultProps = {
    brandId: 'brand-1',
    link: null,
    onConfirm: vi.fn(),
  };

  it('renders brand link form', () => {
    render(<ModalBrandLink {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
