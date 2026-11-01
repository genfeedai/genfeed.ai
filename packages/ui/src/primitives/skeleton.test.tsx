import { render, screen } from '@testing-library/react';
import { Skeleton } from '@ui/primitives/skeleton';
import { describe, expect, it } from 'vitest';

describe('Skeleton primitive', () => {
  it('renders a busy, block-level placeholder so height and width apply', () => {
    render(<Skeleton className="h-10 w-1/2" />);

    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton).toHaveClass('block', 'h-10', 'w-1/2');
  });

  it('sweeps light across the block and holds still under reduced motion', () => {
    render(<Skeleton />);

    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveClass(
      'before:animate-skeleton',
      'motion-reduce:before:hidden',
    );
    expect(skeleton).not.toHaveClass('animate-pulse');
  });
});
