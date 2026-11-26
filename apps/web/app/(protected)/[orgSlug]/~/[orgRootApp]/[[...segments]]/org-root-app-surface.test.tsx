// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgRootAppPageProps } from '@/props/layout/org-root-app-page.props';

const { loadProtectedBootstrapMock, notFoundMock, redirectMock, routeContext } =
  vi.hoisted(() => ({
    loadProtectedBootstrapMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirectMock: vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
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

vi.mock('@ui/display/error-boundary/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
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

vi.mock('@/features/studio/editor/EditorWorkspace', () => ({
  default: () => <div data-testid="editor-projects-page" />,
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

const { default: OrgRootAppPage } = await import('./org-root-app-surface');

describe('OrgRootAppSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(routeContext, {
      orgSlug: 'org-A',
      brandSlug: undefined,
      brandId: '',
    });
    loadProtectedBootstrapMock.mockResolvedValue(null);
  });

  it.each(['library', 'publishing'])(
    'leaves %s to its own static route',
    async (orgRootApp) => {
      await expect(
        OrgRootAppPage({
          params: Promise.resolve({ orgRootApp, orgSlug: 'acme' }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
      expect(notFoundMock).toHaveBeenCalled();
    },
  );

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

      expect(screen.getByText('Select a brand')).toBeInTheDocument();
      expect(
        screen.getByText('Pick one in the top bar to continue.'),
      ).toBeInTheDocument();
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

  it('renders the studio Editor detail surface', async () => {
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

  it('awaits real editor params and forwards the literal detail ID without brand params', async () => {
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
      orgRootApp: 'editor',
      orgSlug: 'org-A',
      segments: ['project-org-2'],
    });
    render(await pending);
    const detail = await screen.findByTestId('editor-detail-page');
    expect(detail).toHaveAttribute('data-id', 'project-org-2');
    expect(detail).toHaveAttribute('data-org', 'org-A');
    expect(detail).toHaveAttribute('data-brand-id', '');
    expect(detail).not.toHaveAttribute('data-brand');
  });
});
