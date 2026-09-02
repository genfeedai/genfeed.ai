import { CardVariant } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Card from '@ui/card/Card';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: () => null,
}));

describe('Card', () => {
  it('renders compact surface styling by default', () => {
    const { container } = render(<Card label="Surface">Body</Card>);
    expect(container.firstChild).toHaveClass('shadow-border');
    expect(container.firstChild).toHaveClass('bg-card');
    expect(container.firstChild).not.toHaveClass('hover:shadow-border-strong');
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
    expect(screen.getByText('Compact system status')).toHaveClass(
      'line-clamp-3',
    );
  });

  it('preserves content and actions slots', () => {
    render(<Card actions={<button type="button">Review</button>}>Body</Card>);

    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('renders keyboard-accessible interactive semantics when onClick is provided', async () => {
    const user = userEvent.setup();
    const activateCard = vi.fn();
    render(<Card label="Interactive" onClick={activateCard} />);

    const interactiveSurface = screen.getByRole('button', {
      name: 'Interactive',
    });

    expect(interactiveSurface).toHaveClass('hover:shadow-border-strong');
    interactiveSurface.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(activateCard).toHaveBeenCalledTimes(2);
  });

  it('supports disabled interactive cards without firing their action', async () => {
    const user = userEvent.setup();
    const activateCard = vi.fn();
    render(
      <Card isDisabled label="Unavailable" onClick={activateCard}>
        Body
      </Card>,
    );

    const interactiveSurface = screen.getByRole('button', {
      name: 'Unavailable',
    });
    expect(interactiveSurface).toBeDisabled();

    await user.click(interactiveSurface);
    expect(activateCard).not.toHaveBeenCalled();
  });

  it('exposes stable ordering metadata when index is provided', () => {
    const { container } = render(<Card index={3}>Body</Card>);
    expect(container.firstChild).toHaveAttribute('data-card-index', '3');
  });

  it('does not clip overlay menus unless an overlay image needs it', () => {
    const { container, rerender } = render(<Card label="Surface">Body</Card>);

    expect(container.firstChild).not.toHaveClass('overflow-hidden');

    rerender(
      <Card id="chat-defaults" label="Chat Defaults">
        Body
      </Card>,
    );
    expect(container.firstChild).toHaveAttribute('id', 'chat-defaults');
    expect(container.firstChild).toHaveClass('scroll-mt-20');
    expect(container.firstChild).not.toHaveClass('overflow-hidden');
  });

  it('clips overlay artwork to the card radius', () => {
    const { container } = render(
      <Card overlay="/cover.png" label="Cover">
        Body
      </Card>,
    );

    expect(container.firstChild).toHaveClass('overflow-hidden');
  });

  it('uses the semantic card surface for the legacy black variant', () => {
    const { container } = render(<Card variant={CardVariant.BLACK}>Body</Card>);

    expect(container.firstChild).toHaveClass('bg-card', 'text-card-foreground');
    expect(container.firstChild).not.toHaveClass('bg-black', 'text-white');
  });

  it('uses the semantic card surface for the legacy white variant', () => {
    const { container } = render(<Card variant={CardVariant.WHITE}>Body</Card>);

    expect(container.firstChild).toHaveClass('bg-card', 'text-card-foreground');
    expect(container.firstChild).not.toHaveClass('bg-white', 'text-black');
  });
});
