// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@ui/primitives/badge';
import { CircleCheck } from 'lucide-react';
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  it('uses the shared ship badge styling contract', () => {
    render(<Badge variant="default">Ready</Badge>);

    const badge = screen.getByText('Ready');

    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('inline-flex');
    expect(badge.className).toContain('gap-1');
    expect(badge.className).toContain('text-2xs');
    expect(badge.className).not.toContain('text-[10px]');
  });

  it('gives outline a theme-aware neutral tone', () => {
    render(<Badge variant="outline">Outline</Badge>);

    const badge = screen.getByText('Outline');

    expect(badge.className).toContain('text-muted-foreground');
    expect(badge.className).toContain('bg-tertiary');
    expect(badge.className).toContain('border-border');
    expect(badge.className).not.toContain('slate-');
  });

  it.each([
    ['destructive', 'text-destructive', 'bg-destructive/15'],
    ['success', 'text-success', 'bg-success/15'],
    ['warning', 'text-warning', 'bg-warning/15'],
    ['info', 'text-info', 'bg-info/15'],
    ['secondary', 'text-muted-foreground', 'bg-tertiary'],
    ['default', 'text-primary', 'bg-primary/15'],
  ] as const)(
    'renders %s with a visible semantic tone',
    (variant, textClass, bgClass) => {
      render(<Badge variant={variant}>{variant}</Badge>);

      const badge = screen.getByText(variant);

      expect(badge.className).toContain(textClass);
      expect(badge.className).toContain(bgClass);
    },
  );

  it('renders a first-class leading icon at the badge icon scale', () => {
    render(
      <Badge icon={<CircleCheck data-testid="status-icon" />}>Ready</Badge>,
    );

    const icon = screen.getByTestId('status-icon');
    expect(icon.parentElement).toHaveAttribute('data-slot', 'badge-icon');
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(icon.parentElement).toHaveClass('[&_svg]:size-3');
  });
});
