// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { PageScope, PostStatus } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notFoundMock, renderPostsListPageMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  renderPostsListPageMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
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

vi.mock('@/features/workflows/pages/executions/WorkflowExecutionsPage', () => ({
  default: () => <div data-testid="workflow-executions-page" />,
}));

vi.mock('@/features/workflows/pages/executions/ExecutionDetailPage', () => ({
  default: ({ executionId }: { executionId: string }) => (
    <div data-execution-id={executionId} data-testid="execution-detail-page" />
  ),
}));

vi.mock('@/features/workflows/pages/library/WorkflowLibraryPage', () => ({
  default: () => <div data-testid="workflow-library-page" />,
}));

vi.mock('@/features/workflows/pages/templates/WorkflowTemplatesPage', () => ({
  default: () => <div data-testid="workflow-templates-page" />,
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

vi.mock('../../../[brandSlug]/workflows/[id]/WorkflowDetailPageClient', () => ({
  default: ({
    initialExecutionId,
    workflowId,
  }: {
    initialExecutionId?: string;
    workflowId: string;
  }) => (
    <div
      data-execution-id={initialExecutionId}
      data-testid="workflow-detail-page"
      data-workflow-id={workflowId}
    />
  ),
}));

vi.mock('../../../[brandSlug]/workflows/new/WorkflowNewPageClient', () => ({
  default: () => <div data-testid="workflow-new-page" />,
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

  it('renders org studio ingredients by requested type', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'studio',
        orgSlug: 'acme',
        segments: ['image'],
      }),
    });

    render(element);

    expect(screen.getByTestId('ingredients-layout')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-type',
      'images',
    );
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

  it('renders org workflow library by default', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'workflows',
        orgSlug: 'acme',
      }),
    });

    render(element);

    expect(screen.getByTestId('workflow-library-page')).toBeInTheDocument();
  });

  it('renders org workflow templates and executions sections', async () => {
    const templatesElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'workflows',
        orgSlug: 'acme',
        segments: ['templates'],
      }),
    });
    const { unmount } = render(templatesElement);

    expect(screen.getByTestId('workflow-templates-page')).toBeInTheDocument();

    unmount();

    const executionsElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'workflows',
        orgSlug: 'acme',
        segments: ['executions'],
      }),
    });
    render(executionsElement);

    expect(screen.getByTestId('workflow-executions-page')).toBeInTheDocument();
  });

  it('restores an org workflow execution detail route', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'workflows',
        orgSlug: 'acme',
        segments: ['executions', 'execution-1'],
      }),
    });

    render(element);

    expect(screen.getByTestId('execution-detail-page')).toHaveAttribute(
      'data-execution-id',
      'execution-1',
    );
  });

  it('renders org workflow new and detail pages', async () => {
    const newElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'workflows',
        orgSlug: 'acme',
        segments: ['new'],
      }),
    });
    const { unmount } = render(newElement);

    expect(screen.getByTestId('workflow-new-page')).toBeInTheDocument();

    unmount();

    const detailElement = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'workflows',
        orgSlug: 'acme',
        segments: ['workflow-1'],
      }),
      searchParams: Promise.resolve({ execution: 'execution-1' }),
    });
    render(detailElement);

    expect(screen.getByTestId('workflow-detail-page')).toHaveAttribute(
      'data-workflow-id',
      'workflow-1',
    );
    expect(screen.getByTestId('workflow-detail-page')).toHaveAttribute(
      'data-execution-id',
      'execution-1',
    );
  });

  it('renders org workflow library for the reserved library segment', async () => {
    const element = await OrgRootAppPage({
      params: Promise.resolve({
        orgRootApp: 'workflows',
        orgSlug: 'acme',
        segments: ['library'],
      }),
    });

    render(element);

    expect(screen.getByTestId('workflow-library-page')).toBeInTheDocument();
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
