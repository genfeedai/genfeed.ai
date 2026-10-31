// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  type LibraryPlace,
  LibraryShelf,
  PageScope,
} from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgRootAppPageProps } from '@/props/layout/org-root-app-page.props';

const {
  loadProtectedBootstrapMock,
  notFoundMock,
  permanentRedirectMock,
  redirectMock,
  renderPostsListPageMock,
  routeContext,
} = vi.hoisted(() => ({
  loadProtectedBootstrapMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  permanentRedirectMock: vi.fn((destination: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${destination}`);
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

vi.mock('@/server/protected-bootstrap.server', () => ({
  loadProtectedBootstrap: loadProtectedBootstrapMock,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({
    orgSlug: routeContext.orgSlug,
    brandSlug: routeContext.brandSlug,
  }),
  notFound: notFoundMock,
  permanentRedirect: permanentRedirectMock,
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

vi.mock('@/features/ingredients/layout/ingredients-layout', () => ({
  default: ({
    children,
    defaultType,
    scope,
  }: {
    children: ReactNode;
    defaultType: string;
    scope: PageScope;
  }) => (
    <section
      data-default-type={defaultType}
      data-scope={scope}
      data-testid="ingredients-layout"
    >
      {children}
    </section>
  ),
}));

vi.mock('@/features/ingredients/list/ingredients-list', () => ({
  default: ({
    folderNavigation,
    scope,
    type,
  }: {
    folderNavigation?: string;
    scope: PageScope;
    type: string;
  }) => (
    <div
      data-folder-navigation={folderNavigation}
      data-scope={scope}
      data-testid="ingredients-list"
      data-type={type}
    />
  ),
}));

vi.mock('@/features/library/overview/library-overview', () => ({
  default: ({ scope }: { scope?: string }) => (
    <div data-scope={scope} data-testid="library-overview" />
  ),
}));

vi.mock('@/features/library/browser/library-browser', () => ({
  default: ({
    children,
    place,
    preset,
    scope,
    shelf,
  }: {
    children: ReactNode;
    place?: LibraryPlace;
    preset?: { label: string };
    scope: PageScope;
    shelf?: LibraryShelf;
  }) => (
    <section
      data-place={place}
      data-preset={preset?.label}
      data-scope={scope}
      data-shelf={shelf}
      data-testid="library-browser"
    >
      {children}
    </section>
  ),
}));

vi.mock('@ui/display/error-boundary/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../[brandSlug]/library/library-credit-notice', () => ({
  default: () => <div data-testid="library-credit-notice" />,
}));

vi.mock('../../../[brandSlug]/library/assets/asset-deep-link', () => ({
  default: () => null,
}));

vi.mock('../../../[brandSlug]/library/captions/page', () => ({
  default: () => <div data-testid="library-captions-page" />,
}));

vi.mock('../../../[brandSlug]/library/voices/library-voices-page', () => ({
  default: ({ scope }: { scope: PageScope }) => (
    <div data-scope={scope} data-testid="library-voices-page" />
  ),
}));

vi.mock('../../../[brandSlug]/messages/outreach/page', () => ({
  default: () => <div data-testid="outreach-sequences-page" />,
}));

vi.mock('../../../[brandSlug]/messages/outreach/new/page', () => ({
  default: () => <div data-testid="outreach-sequence-new-page" />,
}));

vi.mock('../../../[brandSlug]/messages/replies/page', () => ({
  default: () => <div data-testid="replies-page" />,
}));

vi.mock('../../../[brandSlug]/messages/reply-drip/page', () => ({
  default: () => <div data-testid="reply-drip-page" />,
}));

vi.mock('../../../[brandSlug]/editor/[id]/page', () => ({
  default: () => {
    throw new Error('route entry must not be invoked by another route');
  },
}));

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

vi.mock('../../../[brandSlug]/editor/new/page', () => ({
  default: () => <div data-testid="editor-new-page" />,
}));

vi.mock('../../../[brandSlug]/editor/editor-projects-page', () => ({
  default: () => <div data-testid="editor-projects-page" />,
}));

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

vi.mock('@/features/posts/library/publishing-desk-view-toggle', () => ({
  default: ({ activeView }: { activeView: string }) => (
    <div data-active-view={activeView} data-testid="publishing-view-toggle" />
  ),
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

vi.mock('@/features/campaigns', () => ({
  CampaignDetailAds: ({ campaignId }: { campaignId: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-ads" />
  ),
  CampaignDetailOverview: ({ campaignId }: { campaignId: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-overview" />
  ),
  CampaignDetailPerformance: ({ campaignId }: { campaignId: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-performance" />
  ),
  CampaignDetailShell: ({
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
  CampaignFormPage: ({ campaignId }: { campaignId?: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-form-page" />
  ),
  CampaignsListPage: () => <div data-testid="campaigns-list-page" />,
}));

const { default: OrgRootAppPage } = await import('./page');

describe('OrgRootAppPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(routeContext, {
      orgSlug: 'org-A',
      brandSlug: undefined,
      brandId: '',
    });
    loadProtectedBootstrapMock.mockResolvedValue(null);
  });

  it('renders org shelves through the same Library browser as brand shelves', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
        segments: ['shelf', 'unsorted'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-browser')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
    expect(screen.getByTestId('library-browser')).toHaveAttribute(
      'data-shelf',
      LibraryShelf.UNSORTED,
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-type',
      'ingredients',
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-folder-navigation',
      'shell',
    );
  });

  it.each([
    [{ place: 'trash' }, '/acme/~/library/trash'],
    [
      { shelf: 'approved', folder: 'f1' },
      '/acme/~/library/shelf/approved?folder=f1',
    ],
    [
      { categories: ['IMAGE', 'IMAGE_EDIT'], search: 'hero' },
      '/acme/~/library/images?search=hero',
    ],
  ])(
    'permanently moves the legacy library query %j to its route',
    async (search, destination) => {
      await expect(
        OrgRootAppPage({
          params: Promise.resolve({
            orgRootApp: 'library',
            orgSlug: 'acme',
            segments: ['assets'],
          }),
          searchParams: Promise.resolve(search),
        }),
      ).rejects.toThrow(`NEXT_PERMANENT_REDIRECT:${destination}`);
    },
  );

  it('keeps All assets for filters that have no route of their own', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
        segments: ['assets'],
      }),
      searchParams: Promise.resolve({ categories: ['IMAGE'], folder: 'f1' }),
    });

    render(element);

    expect(screen.getByTestId('library-browser')).toBeInTheDocument();
    expect(permanentRedirectMock).not.toHaveBeenCalled();
  });

  it('renders org type routes as presets over the unified browser', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
        segments: ['images'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-browser')).toHaveAttribute(
      'data-preset',
      'Images',
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-type',
      'ingredients',
    );
  });

  it('reuses the brand voice library component with organization scope', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
        segments: ['voices'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-voices-page')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
  });

  it('reuses the same captions library component in organization scope', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
        segments: ['captions'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-captions-page')).toBeInTheDocument();
  });

  it('does not render workspace through the org catch-all', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'workspace',
          orgSlug: 'acme',
          segments: ['overview'],
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalled();
  });

  it('redirects the org Library root to the Library Overview (#5502)', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'library',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/library/overview');

    expect(redirectMock).toHaveBeenCalledWith('/acme/~/library/overview');
  });

  it('renders the organization Library Overview without brand-only References', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
        segments: ['overview'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-overview')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
  });

  it.each([
    [['outreach'], 'outreach-sequences-page'],
    [['outreach', 'new'], 'outreach-sequence-new-page'],
    [['replies'], 'replies-page'],
    [['reply-drip'], 'reply-drip-page'],
  ])('renders the organization Messages route %j', async (segments, testId) => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'messages',
        orgSlug: 'acme',
        segments,
      }),
    });

    render(element);

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it.each([[undefined], [['music']], [['playground', 'extra']]])(
    'serves no Studio parent, whatever its segments %j (#5502)',
    async (segments) => {
      await expect(
        OrgRootAppPage({
          params: Promise.resolve({
            orgRootApp: 'studio',
            orgSlug: 'acme',
            ...(segments ? { segments } : {}),
          }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
      expect(redirectMock).not.toHaveBeenCalled();
      expect(loadProtectedBootstrapMock).not.toHaveBeenCalled();
    },
  );

  it.each([['playground'], ['storyboard'], ['turbo'], ['motion'], ['clipper']])(
    'serves no child routes under the org %s entry',
    async (orgRootApp) => {
      await expect(
        OrgRootAppPage({
          params: Promise.resolve({
            orgRootApp,
            orgSlug: 'acme',
            segments: ['extra'],
          }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
      expect(redirectMock).not.toHaveBeenCalled();
      expect(loadProtectedBootstrapMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['playground', '/acme/moonrise/playground'],
    ['storyboard', '/acme/moonrise/storyboard'],
    ['turbo', '/acme/moonrise/turbo'],
    ['motion', '/acme/moonrise/motion'],
    ['clipper', '/acme/moonrise/clipper'],
  ])(
    'opens the %s app in the persisted last-used brand (#4671)',
    async (segment, destination) => {
      loadProtectedBootstrapMock.mockResolvedValue({
        brandId: 'brand-1',
        brands: [
          {
            id: 'brand-1',
            organization: { slug: 'acme' },
            slug: 'moonrise',
          },
        ],
      });

      await expect(
        OrgRootAppPage({
          params: Promise.resolve({
            orgRootApp: segment,
            orgSlug: 'acme',
          }),
        }),
      ).rejects.toThrow(`NEXT_REDIRECT:${destination}`);
      expect(redirectMock).toHaveBeenCalledWith(destination);
    },
  );

  it('falls back to Agent for a Studio app when there is no persisted brand (#4671)', async () => {
    loadProtectedBootstrapMock.mockResolvedValue({
      brandId: '',
      brands: [],
    });

    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'playground',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/agent/new');
    expect(redirectMock).toHaveBeenCalledWith('/acme/~/agent/new');
  });

  it('falls back to Agent for a Studio app when the persisted brand is stale or deleted (#4671)', async () => {
    loadProtectedBootstrapMock.mockResolvedValue({
      brandId: 'deleted-brand',
      brands: [
        {
          id: 'brand-1',
          organization: { slug: 'acme' },
          slug: 'moonrise',
        },
      ],
    });

    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'playground',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/agent/new');
    expect(redirectMock).toHaveBeenCalledWith('/acme/~/agent/new');
  });

  it('falls back to Agent for a Studio app when the persisted brand belongs to another organization', async () => {
    loadProtectedBootstrapMock.mockResolvedValue({
      brandId: 'brand-1',
      brands: [
        {
          id: 'brand-1',
          organization: { slug: 'other-org' },
          slug: 'moonrise',
        },
      ],
    });

    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'playground',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/agent/new');
    expect(redirectMock).toHaveBeenCalledWith('/acme/~/agent/new');
  });

  it('redirects bare org Publishing to its canonical overview', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'publishing',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/publishing/overview');
    expect(redirectMock).toHaveBeenCalledWith('/acme/~/publishing/overview');
  });

  it('renders the canonical organization publishing overview', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
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
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
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
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
        orgSlug: 'acme',
        segments: ['calendar'],
      }),
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-calendar-page')).toBeInTheDocument();
    expect(screen.getByTestId('publishing-view-toggle')).toHaveAttribute(
      'data-active-view',
      'calendar',
    );
  });

  it.each([
    [['approvals']],
    [['approvals', 'run-1']],
    [['approvals', 'run-1', 'item-1']],
  ])('renders the org approvals queue for %j', async (segments) => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
        orgSlug: 'acme',
        segments,
      }),
    });

    render(element);

    expect(screen.getByTestId('publishing-review-queue')).toBeInTheDocument();
    expect(screen.getByTestId('publishing-view-toggle')).toHaveAttribute(
      'data-active-view',
      'approvals',
    );
  });

  it('returns not found for approvals paths deeper than run and item', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'publishing',
          orgSlug: 'acme',
          segments: ['approvals', 'run-1', 'item-1', 'extra'],
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('returns not found for the retired org publishing review route', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'publishing',
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
      await OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'publishing',
          orgSlug: 'acme',
          segments: ['posts'],
        }),
        searchParams: Promise.resolve({ view }),
      });

      expect(permanentRedirectMock).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
    },
  );

  it('renders organization content detail through the canonical publishing editor', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
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
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
        orgSlug: 'acme',
        segments: ['campaigns'],
      }),
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('campaigns-list-page')).toBeInTheDocument();
  });

  it('renders the organization campaign comparison page', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
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
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
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
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
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
        OrgRootAppPage({
          params: Promise.resolve({
            orgRootApp: 'publishing',
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
        OrgRootAppPage({
          params: Promise.resolve({
            orgRootApp: 'publishing',
            orgSlug: 'acme',
            segments,
          }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it.each(['write', 'compose'])(
    'returns not found for retired org %s route',
    async (orgRootApp) => {
      await expect(
        OrgRootAppPage({
          params: Promise.resolve({ orgRootApp, orgSlug: 'acme' }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');

      expect(notFoundMock).toHaveBeenCalled();
    },
  );

  it('has no org-scoped /workflows route at all', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'workflows',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    ['overview'],
    ['workflows'],
    ['workflows', 'executions'],
    ['runs'],
    ['agents'],
    ['autopilot'],
    ['campaigns'],
  ])(
    'renders the brand-selection empty state for org Automation path %s',
    async (...segments) => {
      const element = await OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'automation',
          orgSlug: 'acme',
          segments,
        }),
      });

      render(element);

      expect(
        screen.getByRole('heading', {
          name: 'Select a brand to use Automation',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Manage brands' }),
      ).toHaveAttribute('href', '/acme/~/settings/brands');
      expect(redirectMock).not.toHaveBeenCalled();
      expect(notFoundMock).not.toHaveBeenCalled();
    },
  );

  it('renders the studio Editor projects surface', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'editor',
        orgSlug: 'acme',
      }),
    });

    render(element);

    expect(screen.getByTestId('editor-projects-page')).toBeInTheDocument();
  });

  it('renders the studio Editor projects surface for the reserved projects segment', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'editor',
        orgSlug: 'acme',
        segments: ['projects'],
      }),
    });

    render(element);

    expect(screen.getByTestId('editor-projects-page')).toBeInTheDocument();
  });

  it('no longer serves the removed studio edit path', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'studio',
          orgSlug: 'acme',
          segments: ['edit', 'project-1'],
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(screen.queryByTestId('editor-detail-page')).not.toBeInTheDocument();
  });

  it('renders the studio Editor new and detail surfaces', async () => {
    const newElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'editor',
        orgSlug: 'acme',
        segments: ['new'],
      }),
    });
    const { unmount } = render(newElement);

    expect(screen.getByTestId('editor-new-page')).toBeInTheDocument();

    unmount();

    const detailElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'editor',
        orgSlug: 'acme',
        segments: ['project-1'],
      }),
    });
    render(detailElement);

    expect(await screen.findByTestId('editor-detail-page')).toHaveAttribute(
      'data-id',
      'project-1',
    );
  });

  it('returns not found for unknown org-root routes', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'unknown',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalled();
  });
  it.each([
    ['editor', undefined, 'project-org-2', 'editor-detail-page', 'data-id'],
    [
      'publishing',
      'posts',
      'content-org-2',
      'publishing-content-detail',
      'data-content-id',
    ],
  ])(
    'awaits real %s params and forwards the literal detail ID without brand params',
    async (orgRootApp, section, id, testId, attribute) => {
      const params =
        Promise.withResolvers<Awaited<OrgRootAppPageProps['params']>>();
      const settled = vi.fn();
      const pending = OrgRootAppPage({ params: params.promise }).then(
        (element) => {
          settled();
          return element;
        },
      );
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      params.resolve({
        orgRootApp,
        orgSlug: 'org-A',
        segments: section ? [section, id] : [id],
      });
      render(await pending);
      const detail = await screen.findByTestId(testId);
      expect(detail).toHaveAttribute(attribute, id);
      expect(detail).toHaveAttribute('data-org', 'org-A');
      expect(detail).toHaveAttribute('data-brand-id', '');
      expect(detail).not.toHaveAttribute('data-brand');
    },
  );

  it('propagates rejected real route params without catching server control', async () => {
    const failure = new Error('params failed');
    await expect(
      OrgRootAppPage({ params: Promise.reject(failure) }),
    ).rejects.toBe(failure);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('retains permissive trailing Editor segments', async () => {
    render(
      await OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'editor',
          orgSlug: 'org-A',
          segments: ['project-trailing', 'extra'],
        }),
      }),
    );
    expect(await screen.findByTestId('editor-detail-page')).toHaveAttribute(
      'data-id',
      'project-trailing',
    );
  });
});
