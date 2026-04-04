import { render, screen } from '@testing-library/react';
import { Skeleton } from '@ui/primitives/skeleton';
import { describe, expect, it } from 'vitest';

describe('Skeleton', () => {
  it('renders without crashing', () => {
    render(<Skeleton />);
    expect(document.querySelector('div')).toBeInTheDocument();
  });

  it('renders as a div element', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('applies custom className', () => {
    render(<Skeleton className="custom-skeleton" data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('custom-skeleton');
  });

  it('preserves default styles with custom className', () => {
    render(<Skeleton className="custom-skeleton" data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveClass('custom-skeleton');
    expect(skeleton).toHaveClass('relative');
    expect(skeleton).toHaveClass('overflow-hidden');
  });

  it('renders children', () => {
    render(
      <Skeleton>
        <span data-testid="child">Child</span>
      </Skeleton>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  describe('styling', () => {
    it('has relative positioning', () => {
      render(<Skeleton data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('relative');
    });

    it('has overflow hidden', () => {
      render(<Skeleton data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('overflow-hidden');
    });

    it('has background color', () => {
      render(<Skeleton data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('bg-white/[0.06]');
    });

    it('has shimmer animation via before pseudo-element', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('before:animate-shimmer');
    });

    it('can be sized with custom width and height', () => {
      render(<Skeleton className="h-4 w-full" data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('h-4');
      expect(skeleton).toHaveClass('w-full');
    });

    it('can have rounded corners', () => {
      render(<Skeleton className="rounded-full" data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveClass('rounded-full');
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Skeleton id="main-skeleton" data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveAttribute(
        'id',
        'main-skeleton',
      );
    });

    it('forwards data attributes', () => {
      render(<Skeleton data-testid="custom-skeleton" />);
      expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
    });

    it('forwards aria-label for accessibility', () => {
      render(<Skeleton aria-label="Loading content" data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveAttribute(
        'aria-label',
        'Loading content',
      );
    });

    it('forwards aria-busy for accessibility', () => {
      render(<Skeleton aria-busy="true" data-testid="skeleton" />);
      expect(screen.getByTestId('skeleton')).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });
  });

  describe('use cases', () => {
    it('can be used as text placeholder', () => {
      render(<Skeleton className="h-4 w-48" data-testid="text-skeleton" />);
      expect(screen.getByTestId('text-skeleton')).toBeInTheDocument();
    });

    it('can be used as image placeholder', () => {
      render(<Skeleton className="h-48 w-full" data-testid="image-skeleton" />);
      expect(screen.getByTestId('image-skeleton')).toBeInTheDocument();
    });

    it('can be used as avatar placeholder', () => {
      render(
        <Skeleton
          className="h-12 w-12 rounded-full"
          data-testid="avatar-skeleton"
        />,
      );
      const skeleton = screen.getByTestId('avatar-skeleton');
      expect(skeleton).toHaveClass('rounded-full');
    });

    it('can be composed for card skeleton', () => {
      render(
        <div>
          <Skeleton className="h-48 w-full" data-testid="image-sk" />
          <Skeleton className="mt-4 h-4 w-3/4" data-testid="title-sk" />
          <Skeleton className="mt-2 h-4 w-1/2" data-testid="desc-sk" />
        </div>,
      );
      expect(screen.getByTestId('image-sk')).toBeInTheDocument();
      expect(screen.getByTestId('title-sk')).toBeInTheDocument();
      expect(screen.getByTestId('desc-sk')).toBeInTheDocument();
    });
  });

  describe('animation', () => {
    it('has gradient shimmer effect', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('before:bg-gradient-to-r');
    });

    it('has animation class', () => {
      render(<Skeleton data-testid="skeleton" />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveClass('before:animate-shimmer');
    });
  });
});
