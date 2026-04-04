import ModalBrandGenerate from '@ui/modals/brands/generate/ModalBrandGenerate';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'modal' }, children),
}));

describe('ModalBrandGenerate', () => {
  const defaultProps = {
    onConfirm: vi.fn(),
    type: 'logo' as const,
  };

  it('renders brand generate modal', () => {
    render(<ModalBrandGenerate {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
