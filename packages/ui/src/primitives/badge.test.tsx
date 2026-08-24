// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@ui/primitives/badge';
import { describe, expect, it } from 'vitest';

describe('Badge', () => {
  it('uses the shared ship badge styling contract', () => {
    render(<Badge variant="default">Ready</Badge>);

    const badge = screen.getByText('Ready');

    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('inline-flex');
  });

  it('gives outline a slate tone so it is not bare white text', () => {
    render(<Badge variant="outline">Outline</Badge>);

    const badge = screen.getByText('Outline');

    expect(badge.className).toContain('text-slate-300');
    expect(badge.className).toContain('bg-slate-500/15');
  });

  it.each([
    ['destructive', 'text-destructive', 'bg-destructive/15'],
    ['success', 'text-success', 'bg-success/15'],
    ['warning', 'text-warning', 'bg-warning/15'],
    ['info', 'text-info', 'bg-info/15'],
    ['secondary', 'text-slate-300', 'bg-slate-500/15'],
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
});
