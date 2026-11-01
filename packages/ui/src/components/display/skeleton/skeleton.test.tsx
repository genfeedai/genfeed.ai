import { render, screen } from '@testing-library/react';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { describe, expect, it } from 'vitest';

describe('SkeletonCard', () => {
  it('renders one accessible card silhouette with no nested placeholders', () => {
    const { container } = render(<SkeletonCard />);
    const card = screen.getByRole('status', { name: 'Loading card' });
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(card.childElementCount).toBe(0);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
    expect(card).toHaveClass('rounded-card', 'motion-reduce:animate-none');
  });

  it('keeps media and text card footprints distinct without drawing fake content', () => {
    const { rerender } = render(<SkeletonCard />);
    const fullHeight = screen.getByRole('status').style.minHeight;
    rerender(<SkeletonCard showImage={false} />);
    expect(screen.getByRole('status').style.minHeight).not.toBe(fullHeight);
    expect(screen.getByRole('status').childElementCount).toBe(0);
  });
});
