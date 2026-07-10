import { CredentialPlatform } from '@genfeedai/enums';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn(async () => 'token-123');
const postConnect = vi.fn(async () => ({
  url: 'https://oauth.example/connect',
}));
const listBrandAccountHealth = vi.fn(async () => [
  {
    assessedAt: '2026-06-30T10:00:00.000Z',
    credentialId: 'credential-1',
    holdPublishing: true,
    holdReason: 'twitter publishing is held because account warmup is warming.',
    label: 'X Account',
    override: { isActive: false },
    platform: CredentialPlatform.TWITTER,
    riskLevel: 'medium',
    score: 56,
    signals: {
      connectedDays: 1,
      profileSignals: 2,
      publishedPosts: 0,
      recentFailures: 0,
    },
    state: 'warming',
    thresholds: {
      maxRecentFailures: 0,
      minConnectedDays: 10,
      minProfileSignals: 2,
      minPublishedPosts: 4,
    },
  },
]);
const overrideAccountHealth = vi.fn(async () => ({
  assessedAt: '2026-06-30T10:00:00.000Z',
  credentialId: 'credential-1',
  holdPublishing: false,
  label: 'X Account',
  override: { isActive: true },
  platform: CredentialPlatform.TWITTER,
  riskLevel: 'medium',
  score: 56,
  signals: {
    connectedDays: 1,
    profileSignals: 2,
    publishedPosts: 0,
    recentFailures: 0,
  },
  state: 'warming',
  thresholds: {
    maxRecentFailures: 0,
    minConnectedDays: 10,
    minProfileSignals: 2,
    minPublishedPosts: 4,
  },
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken,
  }),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async (getTokenFn: () => Promise<string>) =>
    getTokenFn(),
  ),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken,
  }),
}));

vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    postConnect = postConnect;
  },
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({
      listBrandAccountHealth,
      overrideAccountHealth,
    }),
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
      success: vi.fn(),
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="social-card">{children}</div>
  ),
}));

vi.mock('@ui/primitives/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

const openSpy = vi.fn();
Object.defineProperty(window, 'open', {
  value: openSpy,
  writable: true,
});

describe('BrandDetailSocialMediaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
            avatarUrl: 'https://cdn.example.com/genfeed.jpg',
            credentialId: 'credential-1',
            handle: 'genfeed',
            name: 'Genfeed',
            platform: CredentialPlatform.TWITTER,
            url: 'https://x.com/genfeed',
          },
        ]}
        connectedPlatformsCount={1}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Open Genfeed on twitter' }),
    ).toHaveAttribute('href', 'https://x.com/genfeed');
    expect(screen.getByAltText('Genfeed profile picture')).toHaveAttribute(
      'src',
      'https://cdn.example.com/genfeed.jpg',
    );
    expect(screen.getByText('@genfeed')).toBeInTheDocument();
  });

  it('renders an initials fallback when an account has no avatar or profile url', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            credentialId: 'credential-1',
            name: 'Acme Studio',
            platform: CredentialPlatform.THREADS,
          },
        ]}
        connectedPlatformsCount={1}
      />,
    );

    expect(screen.getByText('Acme Studio')).toBeInTheDocument();
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders multiple accounts from the same platform independently', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            credentialId: 'credential-1',
            handle: 'genfeed',
            name: 'Genfeed',
            platform: CredentialPlatform.TWITTER,
            url: 'https://x.com/genfeed',
          },
          {
            credentialId: 'credential-2',
            handle: 'genfeedlabs',
            name: 'Genfeed Labs',
            platform: CredentialPlatform.TWITTER,
            url: 'https://x.com/genfeedlabs',
          },
        ]}
        connectedPlatformsCount={2}
      />,
    );

    expect(screen.getByText('Genfeed')).toBeInTheDocument();
    expect(screen.getByText('Genfeed Labs')).toBeInTheDocument();
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
            credentialId: 'credential-1',
            handle: 'genfeed',
            platform: CredentialPlatform.TWITTER,
            url: 'https://x.com/genfeed',
          },
        ]}
        connectedPlatformsCount={1}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Open genfeed on twitter' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /manage/i }));

    expect(
      screen.getByText(/connect channels for this brand/i),
    ).toBeInTheDocument();
  });

  it('renders account health and confirms a manual override', async () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            credentialId: 'credential-1',
            handle: 'genfeed',
            platform: CredentialPlatform.TWITTER,
            url: 'https://x.com/genfeed',
          },
        ]}
        connectedPlatformsCount={1}
      />,
    );

    expect(await screen.findByText('Account health')).toBeInTheDocument();
    expect(screen.getByText('Warming')).toBeInTheDocument();
    expect(screen.getByText(/score 56/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /override 24h/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm override/i }));

    await waitFor(() => {
      expect(overrideAccountHealth).toHaveBeenCalledWith(
        'credential-1',
        expect.objectContaining({
          confirm: true,
          reason: 'Manual override confirmed from brand social dashboard.',
        }),
      );
    });
  });
});
