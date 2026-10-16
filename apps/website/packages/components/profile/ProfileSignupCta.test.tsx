import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProfileSignupCta, { getProfileSignupHref } from './ProfileSignupCta';

describe('ProfileSignupCta', () => {
  it('links to app sign-up with the profile owner referral code', () => {
    render(<ProfileSignupCta handle="acme" referralCode="frend2345xyz" />);

    const link = screen.getByRole('link', { name: /sign up to genfeed/i });
    const url = new URL(link.getAttribute('href') ?? '');

    expect(url.pathname).toBe('/sign-up');
    expect(url.searchParams.get('ref')).toBe('frend2345xyz');
  });

  it('still offers plain sign-up when the owner has no code', () => {
    render(<ProfileSignupCta handle="acme" referralCode={null} />);

    const link = screen.getByRole('link', { name: /sign up to genfeed/i });
    const url = new URL(link.getAttribute('href') ?? '');

    expect(url.pathname).toBe('/sign-up');
    expect(url.searchParams.has('ref')).toBe(false);
  });

  it('drops a malformed code instead of forwarding it', () => {
    const url = new URL(getProfileSignupHref('NOT A CODE!'));

    expect(url.searchParams.has('ref')).toBe(false);
  });
});
