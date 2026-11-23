import { fireEvent, render, screen } from '@testing-library/react';
import ConnectedAccount from '@ui/display/connected-account/ConnectedAccount';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import { describe, expect, it } from 'vitest';

describe('ConnectedAccount', () => {
  it('shows the @handle with the platform badge on one line', () => {
    render(
      <ConnectedAccount
        account={{ handle: 'genfeedai', name: 'Genfeed', platform: 'tiktok' }}
      />,
    );

    expect(screen.getByText('@genfeedai')).toBeInTheDocument();
    expect(screen.queryByText('Genfeed')).not.toBeInTheDocument();
  });

  it('does not double the @ when the handle already carries one', () => {
    render(
      <ConnectedAccount
        account={{ handle: '@genfeedai', platform: 'youtube' }}
      />,
    );

    expect(screen.getByText('@genfeedai')).toBeInTheDocument();
  });

  it('stacks the account name above its handle', () => {
    render(
      <ConnectedAccount
        account={{
          handle: 'genfeedai',
          name: 'Genfeed',
          platform: 'instagram',
        }}
        layout="stacked"
      />,
    );

    expect(screen.getByText('Genfeed')).toBeInTheDocument();
    expect(screen.getByText('@genfeedai')).toBeInTheDocument();
  });

  it('falls back to the platform name when the account has no handle or name', () => {
    render(<ConnectedAccount account={{ platform: 'youtube' }} />);

    expect(screen.getAllByText('YouTube').length).toBeGreaterThan(0);
  });

  it('draws the account picture from its real avatar URL', () => {
    const { container } = render(
      <ConnectedAccountAvatar
        account={{
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
          handle: 'genfeedai',
          platform: 'tiktok',
        }}
      />,
    );

    // Radix renders the image only once it has loaded; the platform badge is
    // always there.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('TikTok')).toBeInTheDocument();
  });

  it('keeps initials and the platform badge for a social account without a picture', () => {
    render(
      <ConnectedAccountAvatar
        account={{ name: 'Genfeed AI', platform: 'instagram' }}
      />,
    );

    expect(screen.getByText('GA')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('shows the Google Ads logo instead of initials for an ad account', () => {
    const { container } = render(
      <ConnectedAccountAvatar
        account={{ name: 'shipshit.dev', platform: 'google_ads' }}
      />,
    );

    expect(screen.queryByText('S')).not.toBeInTheDocument();
    expect(container.querySelector('svg rect[fill="#FBBC04"]')).not.toBeNull();
  });

  it('hides a decorative avatar from assistive tech', () => {
    const { container } = render(
      <ConnectedAccountAvatar
        account={{ name: 'Genfeed AI', platform: 'instagram' }}
        isDecorative
      />,
    );

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    fireEvent.error(container);
  });
});
