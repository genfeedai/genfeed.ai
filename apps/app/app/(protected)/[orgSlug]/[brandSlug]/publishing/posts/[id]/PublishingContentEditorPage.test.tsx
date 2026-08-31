import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishingContentEditorPage from './PublishingContentEditorPage';

const mocks = vi.hoisted(() => ({
  articleFindOne: vi.fn(),
  authedServiceError: null as Error | null,
  isReady: true,
  newsletterFindOne: vi.fn(),
  postFindOne: vi.fn(),
}));

interface EditorMockProps {
  artifactId: string;
}

interface PostDetailMockProps {
  postId: string;
  presentation?: string;
  scope: string;
}

interface ShellMockProps {
  children: ReactNode;
  title: string;
}

vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/edit/article/[id]/content',
  () => ({
    default: ({ artifactId }: EditorMockProps) => (
      <div data-testid="article-editor">{artifactId}</div>
    ),
  }),
);

vi.mock(
  '@app/(protected)/[orgSlug]/[brandSlug]/edit/newsletter/[id]/content',
  () => ({
    default: ({ artifactId }: EditorMockProps) => (
      <div data-testid="newsletter-editor">{artifactId}</div>
    ),
  }),
);

vi.mock('@pages/posts/detail/post-detail', () => ({
  default: ({ postId, presentation, scope }: PostDetailMockProps) => (
    <div
      data-testid="post-detail"
      data-presentation={presentation}
      data-scope={scope}
    >
      {postId}
    </div>
  ),
}));

vi.mock('../../../edit/artifact-editor-shell', () => ({
  default: ({ children, title }: ShellMockProps) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ isReady: mocks.isReady }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    return async () => {
      if (mocks.authedServiceError) {
        throw mocks.authedServiceError;
      }
      return factory('token');
    };
  },
}));

vi.mock('@services/content/posts.service', () => ({
  PostsService: {
    getInstance: () => ({ findOne: mocks.postFindOne }),
  },
}));

vi.mock('@services/content/articles.service', () => ({
  ArticlesService: {
    getInstance: () => ({ findOne: mocks.articleFindOne }),
  },
}));

vi.mock('@services/content/newsletters.service', () => ({
  NewslettersService: {
    getInstance: () => ({ findOne: mocks.newsletterFindOne }),
  },
}));

// react-query needs a provider in real app; use a minimal inline mock of useQuery
// that runs the queryFn immediately so we do not depend on QueryClient setup.
vi.mock('@tanstack/react-query', async () => {
  const React = await import('react');
  return {
    useQuery: ({
      enabled = true,
      queryFn,
      queryKey,
    }: {
      enabled?: boolean;
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
      queryKey: unknown[];
    }) => {
      const [state, setState] = React.useState<{
        data: unknown;
        isError: boolean;
        isLoading: boolean;
      }>({ data: undefined, isError: false, isLoading: true });

      React.useEffect(() => {
        if (!enabled) {
          setState({ data: undefined, isError: false, isLoading: true });
          return;
        }
        let cancelled = false;
        const controller = new AbortController();
        void queryFn({ signal: controller.signal })
          .then((data) => {
            if (!cancelled) {
              setState({ data, isError: false, isLoading: false });
            }
          })
          .catch(() => {
            if (!cancelled) {
              setState({ data: undefined, isError: true, isLoading: false });
            }
          });
        return () => {
          cancelled = true;
          controller.abort();
        };
        // queryKey[1] is contentId
      }, [enabled, queryKey[1]]);

      return state;
    },
  };
});

describe('PublishingContentEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authedServiceError = null;
    mocks.isReady = true;
    mocks.postFindOne.mockRejectedValue(new Error('miss'));
    mocks.articleFindOne.mockRejectedValue(new Error('miss'));
    mocks.newsletterFindOne.mockRejectedValue(new Error('miss'));
  });

  it('mounts PostDetail when the id is a post (no kind query)', async () => {
    mocks.postFindOne.mockResolvedValue({ id: 'content-1' });

    render(<PublishingContentEditorPage contentId="content-1" />);

    expect(await screen.findByTestId('post-detail')).toHaveTextContent(
      'content-1',
    );
    expect(screen.getByTestId('post-detail')).toHaveAttribute(
      'data-presentation',
      'page',
    );
  });

  it('mounts the article editor when the id is an article, without ?kind=', async () => {
    mocks.articleFindOne.mockResolvedValue({ id: 'article-1' });

    render(<PublishingContentEditorPage contentId="article-1" />);

    expect(await screen.findByTestId('article-editor')).toHaveTextContent(
      'article-1',
    );
    expect(screen.queryByTestId('post-detail')).not.toBeInTheDocument();
  });

  it('mounts the newsletter editor when the id is a newsletter', async () => {
    mocks.newsletterFindOne.mockResolvedValue({ id: 'nl-1' });

    render(<PublishingContentEditorPage contentId="nl-1" />);

    expect(await screen.findByTestId('newsletter-editor')).toHaveTextContent(
      'nl-1',
    );
  });

  it('shows not found when no entity owns the id', async () => {
    render(<PublishingContentEditorPage contentId="missing" />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Content not found' }),
      ).toBeVisible();
    });
    expect(
      screen.getByText(/no post, article, or newsletter matches this id/i),
    ).toBeVisible();
  });

  it('keeps the loading shell while brand context is not ready', () => {
    mocks.isReady = false;

    render(<PublishingContentEditorPage contentId="content-1" />);

    expect(screen.getByRole('heading', { name: 'Loading…' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Content not found' }),
    ).not.toBeInTheDocument();
    expect(mocks.postFindOne).not.toHaveBeenCalled();
  });

  it('does not treat a service failure as a missing post', async () => {
    mocks.authedServiceError = new Error('auth not ready');

    render(<PublishingContentEditorPage contentId="content-1" />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Could not load content' }),
      ).toBeVisible();
    });
    expect(
      screen.queryByRole('heading', { name: 'Content not found' }),
    ).not.toBeInTheDocument();
  });
});
