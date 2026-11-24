import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorFooter from './CreatorFooter';

describe('CreatorFooter', () => {
  it('holds Join Genfeed with the owner referral code', () => {
    render(<CreatorFooter handle="acme" referralCode="frend2345xyz" />);

    const link = screen.getByRole('link', { name: 'Join Genfeed' });
    const url = new URL(link.getAttribute('href') ?? '');

    expect(url.pathname).toBe('/sign-up');
    expect(url.searchParams.get('ref')).toBe('frend2345xyz');
  });

  it('offers a plain Join Genfeed when the owner has no code', () => {
    render(<CreatorFooter handle="acme" />);

    const url = new URL(
      screen.getByRole('link', { name: 'Join Genfeed' }).getAttribute('href') ??
        '',
    );

    expect(url.searchParams.has('ref')).toBe(false);
  });
});
