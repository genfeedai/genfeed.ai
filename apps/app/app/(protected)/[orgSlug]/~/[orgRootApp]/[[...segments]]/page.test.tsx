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

vi.mock('@ui/loading/fallback/LazyLoadingFallback', () => ({
  default: () => <div data-testid="lazy-loading-fallback" />,
}));

vi.mock('@ui/loading/skeleton/SkeletonFallbacks', () => ({
  SkeletonLoadingFallback: () => (
    <div data-testid="skeleton-loading-fallback" />
  ),
}));

vi.mock('@ui/display/error-boundary/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/guards/feature/FeatureGate', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../[brandSlug]/studio/[type]/StudioPageContent', () => ({
  default: ({ typeOverride }: { typeOverride?: string }) => (
    <div data-testid="studio-page-content" data-type={typeOverride} />
  ),
}));

vi.mock('../../../[brandSlug]/studio/[type]/studio-route', () => ({
  canonicalizeStudioType: (value?: string) => value ?? 'image',
}));

vi.mock('../../../[brandSlug]/editor/[id]/page', () => ({
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

vi.mock('../../../[brandSlug]/editor/new/page', () => ({
  default: () => <div data-testid="editor-new-page" />,
}));

vi.mock('../../../[brandSlug]/editor/editor-projects-page', () => ({
  default: () => <div data-testid="editor-projects-page" />,
}));

vi.mock('../../../[brandSlug]/posts/posts-list-page', () => ({
  renderPostsListPage: (args: unknown) => {
    renderPostsListPageMock(args);
    return <div data-testid="posts-list-page" />;
  },
}));

vi.mock('../../../[brandSlug]/posts/posts-layout-content', () => ({
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

  it('does not support legacy org workspace overview aliases', async () => {
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

  it('renders the studio generate surface for org /studio/:type (not library)', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'studio',
        orgSlug: 'acme',
        segments: ['music'],
      }),
    });

    render(element);

    expect(screen.getByTestId('studio-page-content')).toBeInTheDocument();
    expect(screen.getByTestId('studio-page-content')).toHaveAttribute(
      'data-type',
      'music',
    );
    expect(screen.queryByTestId('ingredients-list')).not.toBeInTheDocument();
  });

  it('renders org posts with published status for /posts/published', async () => {
    const searchParams = Promise.resolve({ page: '2' });
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'posts',
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

  it('renders write as the org posts list', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'write',
        orgSlug: 'acme',
      }),
    });

    render(element);

    expect(screen.getByTestId('posts-layout-content')).toBeInTheDocument();
    expect(screen.getByTestId('posts-list-page')).toBeInTheDocument();
    expect(renderPostsListPageMock).toHaveBeenCalledWith({
      scope: PageScope.ORGANIZATION,
      searchParams: expect.any(Promise),
      statusOverride: undefined,
    });
  });

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

  it('sends deeper org-scoped automation paths to the Automate overview', async () => {
    await expect(
      OrgRootAppPage({
        params: Promise.resolve({
          orgRootApp: 'automate',
          orgSlug: 'acme',
          segments: ['workflows'],
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/automate');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('renders org editor projects', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'editor',
        orgSlug: 'acme',
      }),
    });

    render(element);

    expect(screen.getByTestId('editor-projects-page')).toBeInTheDocument();
  });

  it('renders org editor projects for the reserved projects segment', async () => {
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

  it('renders org editor new and detail pages', async () => {
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

    expect(screen.getByTestId('editor-detail-page')).toHaveAttribute(
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
});
