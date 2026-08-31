// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { PageScope, PostStatus } from '@genfeedai/enums';
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
  default: ({ scope, type }: { scope: PageScope; type: string }) => (
    <div data-scope={scope} data-testid="ingredients-list" data-type={type} />
  ),
}));

vi.mock('@ui/display/error-boundary/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/guards/feature/FeatureGate', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
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

const { default: OrgRootAppPage } = await import('./page');

describe('OrgRootAppPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders org library ingredients by requested type', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
        segments: ['images'],
      }),
    });

    render(element);

    expect(screen.getByTestId('ingredients-layout')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
    expect(screen.getByTestId('ingredients-layout')).toHaveAttribute(
      'data-default-type',
      'images',
    );
    expect(screen.getByTestId('ingredients-layout')).toHaveAttribute(
      'data-hide-type-tabs',
      'true',
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-type',
      'images',
    );
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

  it('renders org library with type tabs at the root', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'library',
        orgSlug: 'acme',
      }),
    });

    render(element);

    expect(screen.getByTestId('ingredients-layout')).toHaveAttribute(
      'data-default-type',
      'videos',
    );
    expect(screen.getByTestId('ingredients-layout')).toHaveAttribute(
      'data-hide-type-tabs',
      'false',
    );
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

  it('renders org posts with published status for /publishing/published', async () => {
    const searchParams = Promise.resolve({ page: '2' });
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'publishing',
        orgSlug: 'acme',
        segments: ['published'],
      }),
      searchParams,
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('posts-list-page')).toBeInTheDocument();
    expect(renderPostsListPageMock).toHaveBeenCalledWith({
      scope: PageScope.ORGANIZATION,
      searchParams,
      statusOverride: PostStatus.PUBLIC,
    });
  });

  it.each([
    ['pending', PostStatus.PENDING],
    ['processing', PostStatus.PROCESSING],
  ] as const)(
    'renders org posts with %s status for /publishing/%s',
    async (segment, status) => {
      const searchParams = Promise.resolve({ page: '2' });
      const element = await OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'publishing',
          orgSlug: 'acme',
          segments: [segment],
        }),
        searchParams,
      });

      render(element);

      expect(renderPostsListPageMock).toHaveBeenCalledWith({
        scope: PageScope.ORGANIZATION,
        searchParams,
        statusOverride: status,
      });
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

  it('sends deeper org-scoped automation paths to the Automation overview', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'automation',
          orgSlug: 'acme',
          segments: ['workflows'],
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/automation');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

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
