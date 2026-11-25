// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { PageScope } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgRootAppEntryPageProps } from '@/props/layout/org-root-app-page.props';

const { notFoundMock, redirectMock, renderPostsListPageMock, routeContext } =
  vi.hoisted(() => ({
    notFoundMock: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
    renderPostsListPageMock: vi.fn(),
    routeContext: {
      orgSlug: 'org-A',
      brandSlug: undefined as string | undefined,
      brandId: '',
    },
  }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({
    orgSlug: routeContext.orgSlug,
    brandSlug: routeContext.brandSlug,
  }),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: routeContext.brandId }),
}));

vi.mock('next/dynamic', async () => {
  const { lazy } = await import('react');
  return { default: lazy };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('../../../[brandSlug]/editor/[id]/editor-page-content', async () => {
  const { useBrand } = await import(
    '@contexts/user/brand-context/brand-context'
  );
  const { useParams } = await import('next/navigation');
  return {
    default: ({ projectId }: { projectId: string }) => {
      const { brandId } = useBrand();
      const params = useParams();
      return (
        <div
          data-id={projectId}
          data-brand-id={brandId}
          data-org={params.orgSlug}
          data-brand={params.brandSlug}
          data-testid="editor-detail-page"
        />
      );
    },
  };
});

vi.mock('../../../[brandSlug]/publishing/publishing-list-page', () => ({
  renderPostsListPage: (args: unknown) => {
    renderPostsListPageMock(args);
    return <div data-testid="posts-list-page" />;
  },
}));

vi.mock('../../../[brandSlug]/publishing/publishing-layout-content', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section data-testid="posts-layout-content">{children}</section>
  ),
}));

vi.mock('../../../[brandSlug]/publishing/overview/page', () => ({
  default: () => <div data-testid="publishing-overview-page" />,
}));

vi.mock('../../../[brandSlug]/publishing/review/review-queue-content', () => ({
  default: () => <div data-testid="publishing-review-queue" />,
}));

vi.mock('../../../[brandSlug]/publishing/posts/[id]/page', () => ({
  default: () => {
    throw new Error('route entry must not be invoked by another route');
  },
}));

vi.mock(
  '../../../[brandSlug]/publishing/posts/[id]/PublishingContentEditorPage',
  async () => {
    const { useBrand } = await import(
      '@contexts/user/brand-context/brand-context'
    );
    const { useParams } = await import('next/navigation');
    return {
      default: ({ contentId }: { contentId: string }) => {
        const { brandId } = useBrand();
        const params = useParams();
        return (
          <div
            data-content-id={contentId}
            data-brand-id={brandId}
            data-org={params.orgSlug}
            data-brand={params.brandSlug}
            data-testid="publishing-content-detail"
          />
        );
      },
    };
  },
);

vi.mock('../../../[brandSlug]/publishing/campaigns/compare/page', () => ({
  default: () => <div data-testid="publishing-campaign-compare" />,
}));

vi.mock(
  '../../../[brandSlug]/publishing/calendar/content-calendar-page',
  () => ({
    default: ({ campaignId }: { campaignId?: string }) => (
      <div data-campaign-id={campaignId} data-testid="campaign-calendar-page" />
    ),
  }),
);

vi.mock('@/features/campaigns/detail/CampaignDetailAds', () => ({
  default: ({ campaignId }: { campaignId: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-ads" />
  ),
}));

vi.mock('@/features/campaigns/detail/CampaignDetailOverview', () => ({
  default: ({ campaignId }: { campaignId: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-overview" />
  ),
}));

vi.mock('@/features/campaigns/detail/CampaignDetailPerformance', () => ({
  default: ({ campaignId }: { campaignId: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-performance" />
  ),
}));

vi.mock('@/features/campaigns/detail/CampaignDetailShell', () => ({
  default: ({
    campaignId,
    children,
    section,
  }: {
    campaignId: string;
    children?: ReactNode;
    section: string;
  }) => (
    <section
      data-campaign-id={campaignId}
      data-section={section}
      data-testid="campaign-detail-shell"
    >
      {children}
    </section>
  ),
}));

vi.mock('@/features/campaigns/form/CampaignFormPage', () => ({
  default: ({ campaignId }: { campaignId?: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-form-page" />
  ),
}));

vi.mock('@/features/campaigns/list/CampaignsListPage', () => ({
  default: () => <div data-testid="campaigns-list-page" />,
}));

const { default: OrgPublishingSurface } = await import(
  './org-publishing-surface'
);

describe('OrgPublishingSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(routeContext, {
      orgSlug: 'org-A',
      brandSlug: undefined,
      brandId: '',
    });
  });

  it('redirects bare org Publishing to its canonical overview', async () => {
    await expect(
      OrgPublishingSurface({
        params: Promise.resolve({
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/publishing/overview');
    expect(redirectMock).toHaveBeenCalledWith('/acme/~/publishing/overview');
  });

  it('renders the canonical organization publishing overview', async () => {
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['overview'],
      }),
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('publishing-overview-page')).toBeInTheDocument();
  });

  it('renders the canonical org posts list', async () => {
    const searchParams = Promise.resolve({ page: '2' });
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['posts'],
      }),
      searchParams,
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('posts-list-page')).toBeInTheDocument();
    expect(renderPostsListPageMock).toHaveBeenCalledWith({
      scope: PageScope.ORGANIZATION,
      searchParams,
    });
  });

  it('renders the org calendar at its own route', async () => {
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['calendar'],
      }),
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-calendar-page')).toBeInTheDocument();
  });

  it.each([
    [['approvals']],
    [['approvals', 'run-1']],
    [['approvals', 'run-1', 'item-1']],
  ])('renders the org approvals queue for %j', async (segments) => {
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments,
      }),
    });

    render(element);

    expect(screen.getByTestId('publishing-review-queue')).toBeInTheDocument();
  });

  it('returns not found for approvals paths deeper than run and item', async () => {
    await expect(
      OrgPublishingSurface({
        params: Promise.resolve({
          orgSlug: 'acme',
          segments: ['approvals', 'run-1', 'item-1', 'extra'],
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns not found for the retired org publishing review route', async () => {
    await expect(
      OrgPublishingSurface({
        params: Promise.resolve({
          orgSlug: 'acme',
          segments: ['review'],
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each(['approvals', 'calendar'])(
    'serves the posts list for a retired ?view=%s tab without redirecting',
    async (view) => {
      await OrgPublishingSurface({
        params: Promise.resolve({
          orgSlug: 'acme',
          segments: ['posts'],
        }),
        searchParams: Promise.resolve({ view }),
      });

      expect(redirectMock).not.toHaveBeenCalled();
    },
  );

  it('renders organization content detail through the canonical publishing editor', async () => {
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['posts', 'content-1'],
      }),
    });

    render(element);

    expect(screen.getByTestId('publishing-content-detail')).toHaveAttribute(
      'data-content-id',
      'content-1',
    );
  });

  it('renders org-scoped Publish Campaigns', async () => {
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['campaigns'],
      }),
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('campaigns-list-page')).toBeInTheDocument();
  });

  it('renders the organization campaign comparison page', async () => {
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['campaigns', 'compare'],
      }),
    });

    render(element);

    expect(
      screen.getByTestId('publishing-campaign-compare'),
    ).toBeInTheDocument();
  });

  it('renders an org-scoped campaign detail without leaking Automate Programs', async () => {
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['campaigns', 'cmp-1'],
      }),
    });

    render(element);

    expect(screen.getByTestId('campaign-detail-shell')).toHaveAttribute(
      'data-campaign-id',
      'cmp-1',
    );
    expect(screen.getByTestId('campaign-overview')).toBeInTheDocument();
  });

  it('filters org campaign content through the posts desk', async () => {
    const searchParams = Promise.resolve({ page: '1' });
    const element = await OrgPublishingSurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['campaigns', 'cmp-1', 'content'],
      }),
      searchParams,
    });

    render(element);

    expect(renderPostsListPageMock).toHaveBeenCalledWith({
      campaignId: 'cmp-1',
      scope: PageScope.ORGANIZATION,
      searchParams,
    });
    expect(renderPostsListPageMock.mock.calls[0][0].searchParams).toBe(
      searchParams,
    );
    expect(screen.getByTestId('campaign-detail-shell')).toHaveAttribute(
      'data-section',
      'content',
    );
    expect(screen.getByTestId('posts-list-page')).toBeInTheDocument();
  });

  it.each(['pending', 'processing', 'published', 'scheduled', 'failed'])(
    'returns not found for the retired org /publishing/%s route',
    async (segment) => {
      await expect(
        OrgPublishingSurface({
          params: Promise.resolve({
            orgSlug: 'acme',
            segments: [segment],
          }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
      expect(renderPostsListPageMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['overview', 'extra'],
    ['posts', 'content-1', 'extra'],
    ['content', 'extra'],
    ['campaigns', 'compare', 'extra'],
    ['campaigns', 'new', 'extra'],
    ['campaigns', 'cmp-1', 'content', 'extra'],
  ])(
    'returns not found for surplus org publishing segments %j',
    async (...segments) => {
      await expect(
        OrgPublishingSurface({
          params: Promise.resolve({
            orgSlug: 'acme',
            segments,
          }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it('awaits real params and forwards the literal content ID without brand params', async () => {
    const params =
      Promise.withResolvers<Awaited<OrgRootAppEntryPageProps['params']>>();
    const settled = vi.fn();
    const pending = OrgPublishingSurface({ params: params.promise }).then(
      (element) => {
        settled();
        return element;
      },
    );
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    params.resolve({
      orgSlug: 'org-A',
      segments: ['posts', 'content-org-2'],
    });
    render(await pending);
    const detail = await screen.findByTestId('publishing-content-detail');
    expect(detail).toHaveAttribute('data-content-id', 'content-org-2');
    expect(detail).toHaveAttribute('data-org', 'org-A');
    expect(detail).toHaveAttribute('data-brand-id', '');
    expect(detail).not.toHaveAttribute('data-brand');
  });
});
