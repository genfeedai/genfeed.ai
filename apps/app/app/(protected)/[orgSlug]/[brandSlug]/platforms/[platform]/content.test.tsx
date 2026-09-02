/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { Platform } from '@genfeedai/enums';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformHomePage from './content';

const mocks = vi.hoisted(() => ({
  brand: { id: 'brand-1', slug: 'moonrise' } as {
    id: string;
    slug: string;
  } | null,
  brandId: 'brand-1' as string | undefined,
  connectPlatform: vi.fn(),
  hasBrandId: true,
  href: (path: string) => `/acme/moonrise${path}`,
  isLoading: false,
  socialConnections: [] as BrandDetailSocialConnection[],
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: mocks.brand,
    brandId: mocks.brandId,
    hasBrandId: mocks.hasBrandId,
    isLoading: mocks.isLoading,
    socialConnections: mocks.socialConnections,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: mocks.href,
  }),
}));

vi.mock(
  '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect',
  () => ({
    usePlatformOAuthConnect: () => mocks.connectPlatform,
  }),
);

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <section>
      {label ? <h1>{label}</h1> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading platform home</div>,
}));

vi.mock('@ui/card/EmptyState', () => ({
  EmptyStateCard: ({
    action,
    description,
    title,
  }: {
    action: { label: string; onClick: () => void };
    description?: string;
    title: string;
  }) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={action.onClick}>
        {action.label}
      </button>
    </div>
  ),
}));

vi.mock('@ui/overview/OverviewLayout', () => ({
  default: ({
    cards,
    header,
    label,
  }: {
    cards: Array<{
      description: string;
      href?: string;
      id: string;
      label: string;
    }>;
    header?: ReactNode;
    label?: string;
  }) => (
    <main>
      {label ? <h1>{label}</h1> : null}
      {header}
      <section aria-label="Platform destinations">
        {cards.map((card) => (
          <article key={card.id}>
            <h2>{card.label}</h2>
            <p>{card.description}</p>
            <a href={card.href}>Open {card.label}</a>
          </article>
        ))}
      </section>
    </main>
  ),
}));

vi.mock('@ui/display/platform-badge/PlatformBadge', () => ({
  default: ({ platform }: { platform: string }) => (
    <span>{platform} badge</span>
  ),
}));

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children?: ReactNode;
  }) => (asChild ? children : <button type="button">{children}</button>),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function connectedInstagram(): BrandDetailSocialConnection {
  return {
    accountHealth: {
      assessedAt: '2026-08-14T00:00:00.000Z',
      credentialId: 'cred-ig-1',
      handle: '@moonrise',
      holdPublishing: false,
      label: 'Moonrise',
      override: { isActive: false },
      platform: Platform.INSTAGRAM,
      riskLevel: 'low',
      score: 90,
      signals: {
        connectedDays: 30,
        profileSignals: 3,
        publishedPosts: 12,
        recentFailures: 0,
      },
      state: 'healthy',
      thresholds: {
        maxRecentFailures: 3,
        minConnectedDays: 7,
        minProfileSignals: 1,
        minPublishedPosts: 1,
      },
    },
    credentialId: 'cred-ig-1',
    handle: '@moonrise',
    label: 'Moonrise IG',
    name: 'Moonrise',
    platform: Platform.INSTAGRAM,
  };
}

describe('PlatformHomePage catalog', () => {
  it('reads copy from the pages.platforms.home catalog', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'content.tsx'),
      'utf8',
    );
    const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
    const translate = translateFromCatalog('pages.platforms.home');

    expect(source).toContain("useTranslations('pages.platforms.home')");
    expect(translate('empty.title', { platform: 'Instagram' })).toBe(
      'Instagram is not connected',
    );
  });
});

describe('PlatformHomePage', () => {
  beforeEach(() => {
    mocks.brand = { id: 'brand-1', slug: 'moonrise' };
    mocks.brandId = 'brand-1';
    mocks.hasBrandId = true;
    mocks.isLoading = false;
    mocks.socialConnections = [];
    mocks.connectPlatform.mockReset();
  });

  it('shows the unconnected empty state with a Connect action', () => {
    render(<PlatformHomePage platform={Platform.INSTAGRAM} />);

    expect(
      screen.getByRole('heading', { name: 'Instagram home' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Instagram is not connected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Instagram' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Social settings' }),
    ).toHaveAttribute('href', '/acme/moonrise/settings/social');
  });

  it('composes existing destination links when the platform is connected', () => {
    mocks.socialConnections = [connectedInstagram()];

    render(<PlatformHomePage platform={Platform.INSTAGRAM} />);

    expect(screen.getByText('@moonrise')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Queue' })).toHaveAttribute(
      'href',
      '/acme/moonrise/publishing/posts?publicationState=not-posted&platform=instagram',
    );
    expect(screen.getByRole('link', { name: 'Open Create' })).toHaveAttribute(
      'href',
      expect.stringContaining('/acme/moonrise/agent/new?prompt='),
    );
    expect(screen.getByRole('link', { name: 'Open Engage' })).toHaveAttribute(
      'href',
      '/acme/moonrise/messages',
    );
    expect(
      screen.getByRole('link', { name: 'Open Connection' }),
    ).toHaveAttribute('href', '/acme/moonrise/settings/social');
    expect(
      screen.getByRole('link', { name: 'Open Top posts' }),
    ).toHaveAttribute(
      'href',
      '/acme/moonrise/analytics/brands/brand-1/platforms/instagram',
    );
    expect(
      screen.queryByRole('link', { name: 'Open Live' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open Replies' }),
    ).not.toBeInTheDocument();
  });

  it('adds live and replies shortcuts for YouTube', () => {
    mocks.socialConnections = [
      {
        ...connectedInstagram(),
        credentialId: 'cred-yt-1',
        platform: Platform.YOUTUBE,
      },
    ];

    render(<PlatformHomePage platform={Platform.YOUTUBE} />);

    expect(screen.getByRole('link', { name: 'Open Live' })).toHaveAttribute(
      'href',
      '/acme/moonrise/automation/library/youtube-chat',
    );
    expect(screen.getByRole('link', { name: 'Open Replies' })).toHaveAttribute(
      'href',
      '/acme/moonrise/messages/replies',
    );
  });
});
