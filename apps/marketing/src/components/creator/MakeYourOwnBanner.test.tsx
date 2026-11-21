import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MakeYourOwnBanner from './MakeYourOwnBanner';

describe('MakeYourOwnBanner', () => {
  it('invites the reader to sign up with the creator referral code', () => {
    render(<MakeYourOwnBanner handle="acme" referralCode="frend2345xyz" />);

    expect(
      screen.getByRole('heading', { name: 'Run content from your own agent' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Video, images, posts and articles, made on your brand.',
      ),
    ).toBeVisible();
    const url = new URL(
      screen
        .getByRole('link', { name: 'Start creating' })
        .getAttribute('href') ?? '',
    );
    expect(url.pathname).toBe('/sign-up');
    expect(url.searchParams.get('ref')).toBe('frend2345xyz');
  });

  it('offers plain sign-up when the creator has no code', () => {
    render(<MakeYourOwnBanner handle="acme" />);

    const url = new URL(
      screen
        .getByRole('link', { name: 'Start creating' })
        .getAttribute('href') ?? '',
    );
    expect(url.searchParams.has('ref')).toBe(false);
  });

  it('stacks the same offer into the outline rail without a second heading', () => {
    render(
      <MakeYourOwnBanner
        handle="acme"
        layout="rail"
        referralCode="frend2345xyz"
      />,
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Run content from your own agent' }),
    ).toBeInTheDocument();
    expect(
      new URL(
        screen
          .getByRole('link', { name: 'Start creating' })
          .getAttribute('href') ?? '',
      ).searchParams.get('ref'),
    ).toBe('frend2345xyz');
  });
});
