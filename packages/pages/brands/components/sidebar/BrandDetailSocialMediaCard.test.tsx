import { CredentialPlatform } from '@genfeedai/enums';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const getToken = vi.fn(async () => 'token-123');
const postConnect = vi.fn(async () => ({
  url: 'https://oauth.example/connect',
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken,
  }),
}));

vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    postConnect = postConnect;
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="social-card">{children}</div>
  ),
}));

vi.mock('@ui/media/social-media-link/SocialMediaLink', () => ({
  __esModule: true,
  default: ({ handle, url }: { handle?: string; url: string }) => (
    <a href={url}>{handle ?? url}</a>
  ),
}));

const openSpy = vi.fn();
Object.defineProperty(window, 'open', {
  value: openSpy,
  writable: true,
});

describe('BrandDetailSocialMediaCard', () => {
  it('renders the social media card shell', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
      />,
    );

    expect(screen.getByTestId('social-card')).toBeInTheDocument();
    expect(screen.getByText('Social Media')).toBeInTheDocument();
    expect(
      screen.getByText(/connect your social media accounts/i),
    ).toBeInTheDocument();
  });

  it('renders connected social links', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            handle: 'genfeed',
            platform: CredentialPlatform.TWITTER,
            url: 'https://x.com/genfeed',
          },
        ]}
        connectedPlatformsCount={1}
      />,
    );

    expect(screen.getByRole('link', { name: 'genfeed' })).toBeInTheDocument();
  });

  it('starts oauth directly from the social card', async () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    fireEvent.click(screen.getByRole('button', { name: /instagram/i }));

    await waitFor(() => {
      expect(getToken).toHaveBeenCalled();
      expect(postConnect).toHaveBeenCalledWith({ brand: 'brand-1' });
      expect(openSpy).toHaveBeenCalledWith(
        'https://oauth.example/connect',
        '_self',
      );
    });
  });

  it('shows connected links in the compact card and exposes management in a dialog', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            handle: 'genfeed',
            platform: CredentialPlatform.TWITTER,
            url: 'https://x.com/genfeed',
          },
        ]}
        connectedPlatformsCount={1}
      />,
    );

    expect(screen.getByRole('link', { name: 'genfeed' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /manage/i }));

    expect(
      screen.getByText(/connect channels for this brand/i),
    ).toBeInTheDocument();
  });
});
