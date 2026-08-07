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
    expect(badge.className).toContain('ship-ui');
  });

  it('preserves the local outline variant API on top of the shared package', () => {
    render(<Badge variant="outline">Outline</Badge>);

    const badge = screen.getByText('Outline');

    expect(badge.className).toContain('bg-transparent');
    expect(badge.className).toContain('border-white/[0.08]');
  });

  it('renders destructive (failed) with a real red tone, not unstyled white', () => {
    render(<Badge variant="destructive">FAILED</Badge>);

    const badge = screen.getByText('FAILED');

    expect(badge.className).toContain('text-destructive');
    expect(badge.className).toContain('bg-destructive/15');
    expect(badge.className).toContain('border-destructive/40');
  });

  it('renders success (completed) with the success semantic tone', () => {
    render(<Badge variant="success">COMPLETED</Badge>);

    const badge = screen.getByText('COMPLETED');

    expect(badge.className).toContain('text-success');
    expect(badge.className).toContain('bg-success/15');
  });
});
