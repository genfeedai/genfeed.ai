import { render, screen } from '@testing-library/react';
import LoadingOverlay from '@ui/loading/overlay/LoadingOverlay';
import { describe, expect, it } from 'vitest';

describe('LoadingOverlay', () => {
  it('renders an accessible overlay status', () => {
    render(<LoadingOverlay message="Rendering" />);

    const overlay = screen.getByRole('alert');
    const spinner = screen.getByRole('status', { name: 'Rendering' });

    expect(overlay).toHaveAttribute('aria-busy', 'true');
    expect(spinner).toHaveClass('animate-spin');
    expect(screen.getByText('Rendering')).toBeInTheDocument();
  });
});
