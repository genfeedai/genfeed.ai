// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { type LibraryPlace, LibraryShelf, PageScope } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notFoundMock, redirectMock, renderPostsListPageMock } = vi.hoisted(
  () => ({
    notFoundMock: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
    renderPostsListPageMock: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@pages/ingredients/layout/ingredients-layout', () => ({
  default: ({
    children,
    defaultType,
    hideTypeTabs,
    scope,
  }: {
    children: ReactNode;
    defaultType: string;
    hideTypeTabs?: boolean;
    scope: PageScope;
  }) => (
    <section
      data-default-type={defaultType}
      data-hide-type-tabs={String(Boolean(hideTypeTabs))}
      data-scope={scope}
      data-testid="ingredients-layout"
    >
      {children}
    </section>
  ),
}));

vi.mock('@pages/ingredients/list/ingredients-list', () => ({
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

vi.mock('@pages/library/browser/library-browser', () => ({
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

vi.mock('@ui/guards/feature/FeatureGate', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../[brandSlug]/library/captions/page', () => ({
  default: () => <div data-testid="library-captions-page" />,
}));

vi.mock('../../../[brandSlug]/library/voices/library-voices-page', () => ({
  default: ({ scope }: { scope: PageScope }) => (
    <div data-scope={scope} data-testid="library-voices-page" />
  ),
}));

vi.mock('../../../[brandSlug]/studio/edit/[id]/page', () => ({
  default: async ({
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }) => {
    const { id } = await params;
    return <div data-id={id} data-testid="editor-detail-page" />;
  },
}));

vi.mock('../../../[brandSlug]/studio/edit/new/page', () => ({
  default: () => <div data-testid="editor-new-page" />,
}));

vi.mock('../../../[brandSlug]/studio/edit/editor-projects-page', () => ({
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

vi.mock(
  '../../../[brandSlug]/publishing/calendar/content-calendar-page',
  () => ({
    default: ({ campaignId }: { campaignId?: string }) => (
      <div data-campaign-id={campaignId} data-testid="campaign-calendar-page" />
    ),
  }),
);

vi.mock('@pages/campaigns', () => ({
  CampaignDetailOverview: ({ campaignId }: { campaignId: string }) => (
    <div data-campaign-id={campaignId} data-testid="campaign-overview" />
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

  it('redirects the org Library root to the canonical All assets browser', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'library',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/library/assets');

    expect(redirectMock).toHaveBeenCalledWith('/acme/~/library/assets');
  });

  it('hands org-scoped /studio/:type off to the Agent', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'studio',
          orgSlug: 'acme',
          segments: ['music'],
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/agent/new');
    expect(redirectMock).toHaveBeenCalledWith('/acme/~/agent/new');
    expect(screen.queryByTestId('ingredients-list')).not.toBeInTheDocument();
  });

  it.each([undefined, ['overview'], ['posts']] as const)(
    'renders the canonical org posts list for /publishing segments %s',
    async (segments) => {
      const searchParams = Promise.resolve({ page: '2' });
      const element = await OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'publishing',
          orgSlug: 'acme',
          segments,
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
    },
  );

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

  it('renders the studio edit projects surface', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'studio',
        orgSlug: 'acme',
        segments: ['edit'],
      }),
    });

    render(element);

    expect(screen.getByTestId('editor-projects-page')).toBeInTheDocument();
  });

  it('renders the studio edit projects surface for the reserved projects segment', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'studio',
        orgSlug: 'acme',
        segments: ['edit', 'projects'],
      }),
    });

    render(element);

    expect(screen.getByTestId('editor-projects-page')).toBeInTheDocument();
  });

  it('renders the studio edit new and detail surfaces', async () => {
    const newElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'studio',
        orgSlug: 'acme',
        segments: ['edit', 'new'],
      }),
    });
    const { unmount } = render(newElement);

    expect(screen.getByTestId('editor-new-page')).toBeInTheDocument();

    unmount();

    const detailElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'studio',
        orgSlug: 'acme',
        segments: ['edit', 'project-1'],
      }),
    });
    render(detailElement);

    expect(screen.getByTestId('editor-detail-page')).toHaveAttribute(
      'data-id',
      'project-1',
    );
  });

  it('returns not found for the retired org editor root', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'editor',
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalled();
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
});
