import { render, screen } from '@testing-library/react';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { describe, expect, it } from 'vitest';

describe('PageLoadingState', () => {
  it('uses semantic theme colors for the spinner and message', () => {
    const { container } = render(
      <PageLoadingState message="Loading workspace" />,
    );

    const spinner = container.querySelector('.animate-spin');

    expect(spinner).toHaveClass('text-foreground/80');
    expect(spinner).not.toHaveClass('text-white/80');
    expect(screen.getByText('Loading workspace')).toHaveClass(
      'text-muted-foreground',
    );
    expect(screen.getByText('Loading workspace')).not.toHaveClass(
      'text-white/40',
    );
  });
});
