// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Switch } from '@ui/primitives/switch';
import { describe, expect, it } from 'vitest';

describe('Switch', () => {
  it('uses a visible off-state track and thumb on dark surfaces', () => {
    render(<Switch aria-label="Public profile" />);

    const root = screen.getByRole('switch', { name: /public profile/i });
    const thumb = root.querySelector('span');

    expect(root.className).toContain('border-white/15');
    expect(root.className).toContain('bg-white/[0.08]');
    expect(root.className).toContain(
      'data-[state=unchecked]:hover:bg-white/[0.12]',
    );
    expect(thumb).not.toBeNull();
    expect(thumb?.className).toContain('data-[state=unchecked]:bg-white');
  });
});
