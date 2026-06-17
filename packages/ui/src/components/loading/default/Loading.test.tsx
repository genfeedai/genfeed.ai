import { render, screen } from '@testing-library/react';
import Loading from '@ui/loading/default/Loading';
import { describe, expect, it } from 'vitest';

describe('Loading', () => {
  it('renders the shared spinner loader', () => {
    const { container } = render(<Loading />);

    const rootElement = container.firstChild as HTMLElement;
    const spinner = screen.getByRole('status', { name: 'Loading' });

    expect(rootElement).toHaveClass('min-h-screen');
    expect(spinner).toHaveClass('animate-spin', 'size-6');
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('renders a partial loader with a message', () => {
    const { container } = render(
      <Loading
        className="custom-loader"
        isFullSize={false}
        message="Loading posts"
      />,
    );

    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('min-h-[60vh]', 'custom-loader');
    expect(screen.getByRole('status', { name: 'Loading posts' })).toHaveClass(
      'animate-spin',
    );
    expect(screen.getByText('Loading posts')).toBeInTheDocument();
  });
});
