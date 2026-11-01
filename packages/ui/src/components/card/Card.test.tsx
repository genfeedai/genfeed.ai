import {
  CardGap,
  CardPadding,
  CardTone,
  CardVariant,
} from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Card from '@ui/card/Card';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: () => null,
}));

describe('Card', () => {
  it('can wrap a full title at the heading level required by its surface', () => {
    const label = 'A long generated title that must remain readable on mobile';
    const { rerender } = render(<Card label={label} />);
    expect(screen.getByRole('heading', { level: 3, name: label })).toHaveClass(
      'truncate',
    );
    rerender(<Card label={label} labelAs="h2" isLabelWrapped />);
    const heading = screen.getByRole('heading', { level: 2, name: label });
    expect(heading).not.toHaveClass('truncate');
    expect(heading).toHaveClass('break-words');
  });
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
      'line-clamp-2',
      'min-h-[2lh]',
    );
  });

  it('opens extra detail from a two-line description', async () => {
    const user = userEvent.setup();
    const onDescriptionClick = vi.fn();
    render(
      <Card
        label="Daily Trends Digest"
        description="Scan the latest social trends daily and email a curated digest."
        onDescriptionClick={onDescriptionClick}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Scan the latest social trends daily and email a curated digest.',
      }),
    );
    expect(onDescriptionClick).toHaveBeenCalledTimes(1);
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

  it('announces the toggle state of a clickable card', () => {
    const { rerender } = render(
      <Card isPressed label="Video" onClick={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    rerender(
      <Card isPressed={false} label="Video" onClick={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    rerender(<Card label="Video" onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Video' })).not.toHaveAttribute(
      'aria-pressed',
    );
  });

  it('draws the bordered variant with a CSS border on the card plane', () => {
    const { container } = render(
      <Card variant={CardVariant.BORDERED}>Body</Card>,
    );

    expect(container.firstChild).toHaveClass(
      'border',
      'border-border',
      'bg-card',
      'text-card-foreground',
    );
    expect(container.firstChild).not.toHaveClass('shadow-border');
  });
});

it('loads inside the same card frame and keeps nested content inert until ready', () => {
  const { container, rerender } = render(
    <Card isLoading label="Results">
      <button type="button">Open result</button>
    </Card>,
  );
  const frame = container.firstElementChild;
  expect(frame).toHaveAttribute('aria-busy', 'true');
  expect(frame).toContainElement(
    screen.getByRole('status', { name: 'Loading Results' }),
  );
  expect(screen.getByRole('status').childElementCount).toBe(0);
  expect(
    screen.queryByRole('button', { name: 'Open result' }),
  ).not.toBeInTheDocument();
  expect(container.querySelector('[inert]')).not.toBeNull();
  rerender(
    <Card label="Results">
      <button type="button">Open result</button>
    </Card>,
  );
  expect(container.firstElementChild).toBe(frame);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open result' })).toBeVisible();
});

it('never adds a skeleton to a static card', () => {
  render(<Card label="Quick actions">Create a post</Card>);
  expect(screen.getByText('Create a post')).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

describe('Card looks', () => {
  it.each([
    [CardPadding.NONE, 'p-0'],
    [CardPadding.SM, 'p-3'],
    [CardPadding.MD, 'p-4'],
    [CardPadding.LG, 'p-5'],
    [CardPadding.XL, 'p-6'],
  ])('pads the body for padding %s', (padding, expected) => {
    render(<Card padding={padding}>Body text</Card>);
    expect(screen.getByText('Body text')).toHaveClass(expected);
  });

  it.each([
    [CardGap.NONE, 'gap-0'],
    [CardGap.SM, 'gap-2'],
    [CardGap.MD, 'gap-3'],
    [CardGap.LG, 'gap-4'],
  ])('spaces the body for gap %s', (gap, expected) => {
    render(<Card gap={gap}>Body text</Card>);
    expect(screen.getByText('Body text')).toHaveClass(expected);
  });

  it('pads and spaces the body by default like a medium card', () => {
    render(<Card>Body text</Card>);
    expect(screen.getByText('Body text')).toHaveClass('p-4', 'gap-3');
  });

  it('renders the inset variant as a borderless recessed panel', () => {
    const { container } = render(
      <Card variant={CardVariant.INSET}>Body text</Card>,
    );
    expect(container.firstChild).toHaveClass('bg-tertiary');
    expect(container.firstChild).not.toHaveClass('shadow-border');
    expect(container.firstChild).not.toHaveClass('border');
  });

  it('renders as the requested element and forwards aria attributes', () => {
    render(
      <Card as="article" aria-label="Summary" role="group">
        Body text
      </Card>,
    );
    expect(screen.getByRole('group', { name: 'Summary' }).tagName).toBe(
      'ARTICLE',
    );
  });

  it('outlines a selected card and rules a toned card', () => {
    const { container, rerender } = render(<Card isSelected>Body text</Card>);
    expect(container.firstChild).toHaveClass('ring-primary/50');
    rerender(<Card tone={CardTone.WARNING}>Body text</Card>);
    expect(container.firstChild).toHaveClass('border-l-warning/40');
  });

  it('gives a linked card hover feedback without making it a button', () => {
    const { container } = render(<Card isInteractive>Body text</Card>);
    expect(container.firstChild).toHaveClass('hover:shadow-border-strong');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('centres the body content on request', () => {
    render(<Card isCentered>Body text</Card>);
    expect(screen.getByText('Body text')).toHaveClass(
      'items-center',
      'text-center',
    );
  });
});
