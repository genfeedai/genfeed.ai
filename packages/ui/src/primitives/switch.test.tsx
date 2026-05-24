// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Switch } from '@ui/primitives/switch';
import { describe, expect, it } from 'vitest';

describe('Switch', () => {
  it('uses the shared ship switch styling contract', () => {
    render(<Switch aria-label="Public profile" />);

    const root = screen.getByRole('switch', { name: /public profile/i });
    const thumb = root.querySelector('span');

    expect(root.className).toContain('ship-ui');
    expect(root.className).toContain('data-[state=unchecked]:bg-hover');
    expect(root.className).toContain('data-[state=checked]:bg-accent');
    expect(thumb).not.toBeNull();
    expect(thumb?.className).toContain(
      'data-[state=unchecked]:bg-[var(--text-primary)]',
    );
  });
});
