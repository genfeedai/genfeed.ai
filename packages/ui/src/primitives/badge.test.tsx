// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@ui/primitives/badge';
import { badgeVariants } from '@ui/primitives/badge.variants';
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
    expect(badge.className).not.toContain('slate-');
  });

  it.each([
    ['destructive', 'text-destructive', 'bg-destructive/10'],
    ['success', 'text-success', 'bg-success/10'],
    ['warning', 'text-warning', 'bg-warning/10'],
    ['info', 'text-info', 'bg-info/10'],
    ['secondary', 'text-muted-foreground', 'bg-tertiary'],
    ['default', 'text-primary', 'bg-primary/10'],
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

  it.each([
    'default',
    'destructive',
    'info',
    'outline',
    'secondary',
    'success',
    'warning',
  ] as const)('renders %s as a soft tint with no border ring', (variant) => {
    expect(badgeVariants({ variant })).not.toMatch(/\bborder\b/);
  });

  it('uses role tokens, never a raw palette colour', () => {
    expect(badgeVariants({ variant: 'outline' })).not.toMatch(
      /(?:white|slate|violet|orange|indigo|blue|cyan|pink|purple|amber)-/,
    );
  });

  it('grows the lg size without changing the tone', () => {
    render(<Badge size="lg">Large</Badge>);

    expect(screen.getByText('Large')).toHaveClass('h-6', 'px-2', 'text-xs');
  });

  it('shows a dash instead of an empty chip when there is no label', () => {
    render(<Badge />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders nothing for a value of 0 and the semibold value otherwise', () => {
    const { container, rerender } = render(<Badge value={0} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<Badge value={3} />);
    expect(screen.getByText('3')).toHaveClass('font-semibold');
  });

  it('passes the remaining span props through', () => {
    render(
      <Badge data-app-state="ready" title="Ready to post">
        Ready
      </Badge>,
    );

    expect(screen.getByText('Ready')).toHaveAttribute(
      'data-app-state',
      'ready',
    );
    expect(screen.getByText('Ready')).toHaveAttribute('title', 'Ready to post');
  });

  it('prefers explicit children over the status label', () => {
    render(<Badge status="completed">Approved</Badge>);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('falls back to the status label when children are omitted', () => {
    render(<Badge status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it.each([
    ['completed', 'bg-success/10', 'text-success'],
    ['pending', 'bg-warning/10', 'text-warning'],
    ['running', 'bg-info/10', 'text-info'],
    ['failed', 'bg-destructive/10', 'text-destructive'],
    ['approved', 'bg-success/10', 'text-success'],
    ['blocked', 'bg-destructive/10', 'text-destructive'],
    ['in_review', 'bg-info/10', 'text-info'],
  ])(
    'derives the %s icon and tint from the canonical status contract',
    (status, bgClass, textClass) => {
      const { container } = render(<Badge status={status}>{status}</Badge>);
      const badge = container.firstElementChild;

      expect(badge).toHaveClass(bgClass, textClass);
      expect(
        badge?.querySelector('[data-slot="badge-icon"] svg'),
      ).not.toBeNull();
    },
  );

  it.each([
    ['scheduled', 'bg-warning/10', 'text-warning'],
    ['processing', 'bg-info/10', 'text-info'],
    ['warning', 'bg-warning/10', 'text-warning'],
    ['canceled', 'bg-muted', 'text-muted-foreground'],
  ])(
    'keeps the %s alias fill and text on one semantic tone',
    (status, bgClass, textClass) => {
      const { container } = render(<Badge status={status} />);

      expect(container.firstElementChild).toHaveClass(bgClass, textClass);
    },
  );

  it.each([
    ['image', 'Image', 'bg-info/10'],
    ['video', 'Video', 'bg-primary/10'],
    ['audio', 'Audio', 'bg-warning/10'],
    ['text', 'Text', 'bg-success/10'],
  ])(
    'maps the %s content type to its label and tone',
    (status, label, bgClass) => {
      const { container } = render(<Badge status={status} />);

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(container.firstElementChild).toHaveClass(bgClass);
    },
  );

  it('does not render a running glyph for a generic information badge', () => {
    const { container } = render(<Badge status="info" />);

    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="badge-icon"]')).toBeNull();
  });

  it.each([
    ['TRIALING', 'Trialing'],
    ['PAST_DUE', 'Past Due'],
    ['INCOMPLETE', 'Incomplete'],
    ['SOMETHING_NEW', 'Something New'],
  ])(
    'names the %s status instead of rendering an empty dot',
    (status, label) => {
      render(<Badge status={status} />);

      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );
});
