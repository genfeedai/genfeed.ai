import { CredentialPlatform } from '@genfeedai/contracts';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resolveOAuthConnectPlatformCatalog } from '@ui/constants/oauth-connect-platforms';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useOAuthConnectPlatforms = vi.hoisted(() => vi.fn());

vi.mock(
  '@hooks/auth/use-oauth-connect-platforms/use-oauth-connect-platforms',
  () => ({ useOAuthConnectPlatforms }),
);

const getToken = vi.fn(async () => 'token-123');
const postConnect = vi.fn(async () => ({
  url: 'https://oauth.example/connect',
}));
const servicesPlatform = vi.fn();
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
    constructor(platform: string) {
      servicesPlatform(platform);
    }

    postConnect = postConnect;
  },
}));

const deleteCredential = vi.fn(async () => ({ id: 'credential-1' }));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({
      delete: deleteCredential,
      listBrandAccountHealth,
      listPostingTimes: vi.fn(async () => []),
      overrideAccountHealth,
    }),
  },
}));

vi.mock(
  '@pages/brands/components/sidebar/CredentialPostingTimesEditor',
  () => ({
    default: ({ credentialId }: { credentialId: string }) => (
      <div data-testid="posting-times-editor">{credentialId}</div>
    ),
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@hooks/data/social/use-social-warmup-enrollment/use-social-warmup-enrollment',
  () => ({
    useSocialWarmupEnrollment: () => ({
      completeItem: vi.fn(),
      data: {
        blueprintId: 'social-warmup.twitter',
        blueprintVersion: 1,
        completedItemIds: [],
        credentialId: 'credential-1',
        currentPhaseId: 'profile-and-topic-consumption',
        hasPartialScopes: false,
        id: 'enrollment-1',
        isCredentialConnected: true,
        signals: [],
        startedAt: '2026-08-08T10:00:00.000Z',
      },
      enroll: vi.fn(),
      error: null,
      isLoading: false,
      refresh: vi.fn(),
      reopenItem: vi.fn(),
    }),
  }),
);

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
  default: ({
    actions,
    children,
    description,
    headerAction,
    icon,
    label,
  }: {
    actions?: ReactNode;
    children: ReactNode;
    description?: ReactNode;
    headerAction?: ReactNode;
    icon?: ReactNode;
    label?: ReactNode;
  }) => (
    <div data-testid="social-card">
      {icon}
      {label ? <h3>{label}</h3> : null}
      {description ? <p>{description}</p> : null}
      {headerAction}
      {children}
      {actions}
    </div>
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
    useOAuthConnectPlatforms.mockReturnValue(
      resolveOAuthConnectPlatformCatalog({ threads: 'available' }),
    );
  });

  it.each(['unknown', 'unavailable'] as const)(
    'disables Threads and cannot issue a connect request when readiness is %s',
    (readiness) => {
      useOAuthConnectPlatforms.mockReturnValue(
        resolveOAuthConnectPlatformCatalog({ threads: readiness }),
      );
      render(
        <BrandDetailSocialMediaCard
          brandId="brand-1"
          connections={[]}
          connectedPlatformsCount={0}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

      const threads = screen.getByRole('button', { name: 'Threads' });
      expect(threads).toBeDisabled();
      fireEvent.click(threads);
      expect(postConnect).not.toHaveBeenCalled();
    },
  );

  it('starts one available Threads action through the canonical service path', async () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));

    await waitFor(() => {
      expect(servicesPlatform).toHaveBeenCalledWith('threads');
      expect(postConnect).toHaveBeenCalledOnce();
      expect(postConnect).toHaveBeenCalledWith({ brandId: 'brand-1' });
    });
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
    expect(screen.getByText('Connected accounts')).toBeInTheDocument();
    expect(
      screen.getByText(/connect accounts to display them here/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No social accounts connected yet.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('groups connect platforms by category in the dialog', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(screen.getByText('Social networks')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('Advertising')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /twitter/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /youtube/i }).length,
    ).toBeGreaterThan(0);
  });

  it('renders the accounts table on the page variant with a Connect account action', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
        variant="page"
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Connect' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Manage' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Connect account' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('No accounts connected yet')).toBeInTheDocument();
  });

  it('derives account status on the page variant: Needs reconnect vs Connected', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            credentialId: 'credential-1',
            externalId: 'ext-1',
            handle: 'genfeed',
            isConnected: true,
            name: 'Genfeed',
            platform: CredentialPlatform.INSTAGRAM,
          },
          {
            credentialId: 'credential-2',
            isConnected: false,
            name: 'Broken TikTok',
            platform: CredentialPlatform.TIKTOK,
          },
        ]}
        connectedPlatformsCount={1}
        variant="page"
      />,
    );

    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs reconnect').length).toBeGreaterThan(0);
  });

  it('sends the credentialId in the connect body when reconnecting an account', async () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            credentialId: 'credential-1',
            isConnected: false,
            name: 'Genfeed',
            platform: CredentialPlatform.TWITTER,
          },
        ]}
        connectedPlatformsCount={0}
        variant="page"
      />,
    );

    const moreActionsTrigger = screen.getAllByRole('button', {
      name: 'More actions for Genfeed',
    })[0];
    fireEvent.pointerDown(moreActionsTrigger);
    fireEvent.click(moreActionsTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(servicesPlatform).toHaveBeenCalledWith('twitter');
      expect(postConnect).toHaveBeenCalledWith({
        brandId: 'brand-1',
        credentialId: 'credential-1',
      });
    });
  });

  it('opens the posting times editor for an account from the accounts table', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            credentialId: 'credential-1',
            externalId: 'ext-1',
            handle: 'genfeed',
            isConnected: true,
            name: 'Genfeed',
            platform: CredentialPlatform.INSTAGRAM,
          },
        ]}
        connectedPlatformsCount={1}
        variant="page"
      />,
    );

    const moreActionsTrigger = screen.getAllByRole('button', {
      name: 'More actions for Genfeed',
    })[0];
    fireEvent.pointerDown(moreActionsTrigger);
    fireEvent.click(moreActionsTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Posting times' }));

    expect(screen.getByTestId('posting-times-editor')).toHaveTextContent(
      'credential-1',
    );
  });

  it('opens the Connect account modal and starts oauth for a chosen platform', async () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
        variant="page"
      />,
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Connect account' })[0],
    );
    fireEvent.click(screen.getByText('Instagram'));

    await waitFor(() => {
      expect(postConnect).toHaveBeenCalledWith({ brandId: 'brand-1' });
    });
  });

  it('offers Fanvue under Creator in the connect modal and omits unavailable X Ads', () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
        variant="page"
      />,
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Connect account' })[0],
    );

    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(screen.getByText('Fanvue')).toBeInTheDocument();
    expect(screen.queryByText('X Ads')).not.toBeInTheDocument();
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
    // The avatar renders in both the account row and the platform card.
    for (const avatar of screen.getAllByAltText('Genfeed profile picture')) {
      expect(avatar).toHaveAttribute(
        'src',
        'https://cdn.example.com/genfeed.jpg',
      );
    }
    expect(screen.getAllByText('@genfeed').length).toBeGreaterThan(0);
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

    // Each account name appears in its row and again on the platform card.
    expect(screen.getAllByText('Genfeed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Genfeed Labs').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: 'Open Genfeed on twitter' }),
    ).toHaveAttribute('href', 'https://x.com/genfeed');
    expect(
      screen.getByRole('link', { name: 'Open Genfeed Labs on twitter' }),
    ).toHaveAttribute('href', 'https://x.com/genfeedlabs');
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
      expect(postConnect).toHaveBeenCalledWith({ brandId: 'brand-1' });
      expect(openSpy).toHaveBeenCalledWith(
        'https://oauth.example/connect',
        '_self',
      );
    });
  });

  it('exposes the Google Ads integration with its API route key', async () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    fireEvent.click(screen.getByRole('button', { name: /google ads/i }));

    await waitFor(() => {
      expect(servicesPlatform).toHaveBeenCalledWith('google-ads');
      expect(postConnect).toHaveBeenCalledWith({ brandId: 'brand-1' });
    });
  });

  it('starts Fanvue OAuth through the existing brand-scoped service route', async () => {
    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[]}
        connectedPlatformsCount={0}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Fanvue' }));

    await waitFor(() => {
      expect(servicesPlatform).toHaveBeenCalledWith('fanvue');
      expect(postConnect).toHaveBeenCalledWith({ brandId: 'brand-1' });
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

  it('disconnects a single account and leaves its platform siblings alone', async () => {
    const onRefresh = vi.fn();

    render(
      <BrandDetailSocialMediaCard
        brandId="brand-1"
        connections={[
          {
            credentialId: 'credential-1',
            handle: 'genfeed',
            name: 'Genfeed',
            platform: CredentialPlatform.TWITTER,
          },
          {
            credentialId: 'credential-2',
            handle: 'genfeedlabs',
            name: 'Genfeed Labs',
            platform: CredentialPlatform.TWITTER,
          },
        ]}
        connectedPlatformsCount={2}
        onRefresh={onRefresh}
        variant="page"
      />,
    );

    const moreActionsTrigger = screen.getAllByRole('button', {
      name: 'More actions for Genfeed Labs',
    })[0];
    fireEvent.pointerDown(moreActionsTrigger);
    fireEvent.click(moreActionsTrigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }));

    // The confirmation has to say the other account survives — that is the
    // whole difference from the old one-account-per-platform behaviour.
    expect(
      screen.getByText(/other accounts on twitter are untouched/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(deleteCredential).toHaveBeenCalledWith('credential-2');
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
