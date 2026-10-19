import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfileFooter from './ProfileFooter';

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => null,
}));

describe('ProfileFooter', () => {
  it('carries the sign-up call to action with the owner referral code', () => {
    render(<ProfileFooter handle="acme" referralCode="frend2345xyz" />);

    const link = screen.getByRole('link', { name: /sign up to genfeed/i });

    expect(link.closest('footer')).not.toBeNull();
    expect(
      new URL(link.getAttribute('href') ?? '').searchParams.get('ref'),
    ).toBe('frend2345xyz');
  });

  it('does not wrap the call to action in a shrink-to-fit box', () => {
    render(<ProfileFooter handle="acme" />);

    const link = screen.getByRole('link', { name: /sign up to genfeed/i });

    // A wrapper would shrink-wrap the full-width button and push it off the
    // profile column.
    expect(link.parentElement?.tagName).toBe('FOOTER');
  });
});
