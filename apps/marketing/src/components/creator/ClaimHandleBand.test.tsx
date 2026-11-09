import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClaimHandleBand, {
  buildClaimLoginHref,
  buildClaimSignUpHref,
} from './ClaimHandleBand';

afterEach(() => {
  vi.unstubAllGlobals();
});

function typeHandle(value: string): void {
  fireEvent.change(screen.getByLabelText('Your handle'), {
    target: { value },
  });
}

describe('ClaimHandleBand', () => {
  it('signs up with the handle carried to the new brand', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<ClaimHandleBand />);

    typeHandle('@Shayla');
    fireEvent.click(screen.getByRole('button', { name: 'Claim handle' }));

    const url = new URL(assign.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe('/sign-up');
    expect(url.searchParams.get('handle')).toBe('shayla');
  });

  it('offers existing accounts a login that lands on the claim step', () => {
    render(<ClaimHandleBand />);

    typeHandle('shayla');

    const url = new URL(
      screen
        .getByRole('link', { name: 'Log in to claim @shayla' })
        .getAttribute('href') ?? '',
    );
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('callbackUrl')).toBe(
      '/onboarding/post-signup?handle=shayla',
    );
  });

  it.each([
    ['vincent_ai', 'Handle must be 2-48 lowercase letters or numbers'],
    ['settings', 'This handle is reserved'],
  ])('explains why %j cannot be claimed', (value, message) => {
    render(<ClaimHandleBand />);

    typeHandle(value);
    fireEvent.click(screen.getByRole('button', { name: 'Claim handle' }));

    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
  });

  it('builds the sign-up and login links for a handle', () => {
    expect(new URL(buildClaimSignUpHref('acme')).search).toBe('?handle=acme');
    expect(
      new URL(buildClaimLoginHref('acme')).searchParams.get('callbackUrl'),
    ).toBe('/onboarding/post-signup?handle=acme');
  });
});
