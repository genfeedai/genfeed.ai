import { render, screen } from '@testing-library/react';
import { StatusDot } from '@ui/primitives/status-dot';
import { describe, expect, it } from 'vitest';

describe('StatusDot', () => {
  it('is decorative until it is given a label', () => {
    const { container } = render(<StatusDot />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('announces itself as an image when it carries meaning', () => {
    render(<StatusDot aria-label="Agent online" tone="success" />);

    expect(screen.getByRole('img', { name: 'Agent online' })).toHaveClass(
      'bg-success',
    );
  });

  it.each([
    ['xs', 'size-1.5'],
    ['sm', 'size-2'],
    ['md', 'size-2.5'],
  ] as const)('sizes the %s dot', (size, expectedClass) => {
    const { container } = render(<StatusDot size={size} />);

    expect(container.firstElementChild).toHaveClass(expectedClass);
  });

  it('pulses only when asked and honours reduced motion', () => {
    const { container, rerender } = render(<StatusDot />);
    expect(container.firstElementChild).not.toHaveClass('animate-pulse');

    rerender(<StatusDot isPulsing />);
    expect(container.firstElementChild).toHaveClass(
      'animate-pulse',
      'motion-reduce:animate-none',
    );
  });

  it('draws a thin caret instead of a dot', () => {
    const { container } = render(<StatusDot shape="caret" tone="foreground" />);

    expect(container.firstElementChild).toHaveClass('h-4', 'w-0.5');
    expect(container.firstElementChild).not.toHaveClass('rounded-full');
  });
});
