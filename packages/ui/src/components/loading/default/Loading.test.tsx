import { render, screen } from '@testing-library/react';
import Loading from '@ui/loading/default/Loading';
import { describe, expect, it } from 'vitest';

describe('Loading', () => {
  it('renders the animated brand loader', () => {
    const { container } = render(<Loading />);

    const rootElement = container.firstChild as HTMLElement;
    const loader = screen.getByRole('status', { name: 'Loading' });

    expect(rootElement).toHaveClass('min-h-screen');
    expect(loader).toHaveClass('genfeed-loader-root');
    expect(loader.querySelector('.genfeed-loader-trace')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
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
      'genfeed-loader-root',
    );
    expect(screen.getByText('Loading posts')).toHaveClass(
      'text-muted-foreground',
    );
    expect(screen.getByText('Loading posts')).not.toHaveClass('text-white/40');
  });
});
