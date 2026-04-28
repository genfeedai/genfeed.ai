import { fireEvent, render, screen } from '@testing-library/react';
import Card from '@ui/card/Card';
import { describe, expect, it, vi } from 'vitest';

describe('Card', () => {
  it('renders compact surface styling by default', () => {
    const { container } = render(<Card label="Surface">Body</Card>);
    expect(container.firstChild).toHaveClass('border-border');
    expect(container.firstChild).toHaveClass('bg-card');
  });

  it('renders header content when label and description are provided', () => {
    render(
      <Card label="Operating Summary" description="Compact system status">
        Body
      </Card>,
    );

    expect(
      screen.getByRole('heading', { name: 'Operating Summary' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Compact system status')).toBeInTheDocument();
  });

  it('preserves content and actions slots', () => {
    render(<Card actions={<button type="button">Review</button>}>Body</Card>);

    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('renders keyboard-accessible interactive semantics when onClick is provided', () => {
    const handleClick = vi.fn();
    render(<Card label="Interactive" onClick={handleClick} />);

    const interactiveSurface = screen.getByRole('button', {
      name: 'Interactive',
    });

    fireEvent.keyDown(interactiveSurface, { key: 'Enter' });
    fireEvent.keyDown(interactiveSurface, { key: ' ' });

    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('exposes stable ordering metadata when index is provided', () => {
    const { container } = render(<Card index={3}>Body</Card>);
    expect(container.firstChild).toHaveAttribute('data-card-index', '3');
  });
});
