import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoadingOverlay from './loading-overlay';

describe('LoadingOverlay', () => {
  it('announces the message as a busy status in the surface tone', () => {
    render(<LoadingOverlay message="Rendering" />);

    const spinner = screen.getByRole('status', { name: 'Rendering' });

    expect(spinner.closest('[aria-busy="true"]')).toHaveClass(
      'absolute',
      'inset-0',
      'bg-background/70',
    );
    expect(spinner).toHaveClass('text-foreground/80');
    expect(screen.getByText('Rendering')).toBeInTheDocument();
  });

  it('shows the message and actions under the spinner on media', () => {
    render(
      <LoadingOverlay message="Generating..." tone="media">
        <button type="button">Stop</button>
      </LoadingOverlay>,
    );

    expect(
      screen.getByRole('status', { name: 'Generating...' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Generating...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('is a plain veil without a spinner on charts', () => {
    const { container } = render(<LoadingOverlay tone="veil" />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('bg-card/50');
  });
});
