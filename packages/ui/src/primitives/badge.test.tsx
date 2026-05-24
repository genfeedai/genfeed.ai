// @vitest-environment jsdom
import '@testing-library/jest-dom';
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
});
