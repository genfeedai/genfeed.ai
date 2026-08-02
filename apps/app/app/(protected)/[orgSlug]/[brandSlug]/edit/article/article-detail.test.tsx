import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleDetail from './article-detail';
import '@testing-library/jest-dom/vitest';

const {
  generateAccountContentMock,
  pushMock,
  useArticleDetailMock,
  useXArticleComposeMock,
} = vi.hoisted(() => ({
  generateAccountContentMock: vi.fn(),
  pushMock: vi.fn(),
  useArticleDetailMock: vi.fn(),
  useXArticleComposeMock: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    generateAccountContent: generateAccountContentMock,
  })),
}));

vi.mock('@hooks/pages/use-article-detail/use-article-detail', () => ({
  useArticleDetail: () => useArticleDetailMock(),
}));

vi.mock('@hooks/pages/use-x-article-compose/use-x-article-compose', () => ({
  useXArticleCompose: () =>
    useXArticleComposeMock() ?? {
      handleCopyFullArticle: vi.fn(),
      handleCopySection: vi.fn(),
      handleDownloadImage: vi.fn(),
      handleGenerateHeaderImage: vi.fn(),
      isGeneratingImage: false,
    },
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    brandSlug: 'brand-123',
    orgSlug: 'org-123',
  })),
  usePathname: vi.fn(() => '/org-123/brand-123/compose/article'),
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: vi.fn(() => ({
    openConfirm: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

const defaultArticleDetailState = () => ({
  article: null,
  error: null,
  form: {
    category: 'blog',
    content: '',
    label: '',
    status: 'draft',
    summary: '',
    tags: '',
  },
  handleArchive: vi.fn(),
  handleDelete: vi.fn(),
  handleEnhance: vi.fn(),
  handlePublish: vi.fn(),
  handleSave: vi.fn(),
  handleScoreSeo: vi.fn(),
  isDirty: false,
  isEnhancing: false,
  isLoading: false,
  isScoringSeo: false,
  isSaving: false,
  pathname: '/org-123/brand-123/compose/article',
  setFormField: vi.fn(),
});

describe('ArticleDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useArticleDetailMock.mockReturnValue(defaultArticleDetailState());
    useXArticleComposeMock.mockReturnValue(undefined);
  });

  it('should render without crashing', () => {
    const { container } = render(<ArticleDetail />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('generates publishable X teaser drafts from an account-aware X Article', async () => {
    useArticleDetailMock.mockReturnValue({
      ...defaultArticleDetailState(),
      article: {
        id: 'article-1',
        label: 'Autonomous Content Systems',
        summary: 'A deeper article about account-aware content.',
        xArticleMetadata: {
          estimatedReadTime: 4,
          sections: [
            {
              content: '<p>Section body</p>',
              heading: 'Context wins',
              id: 'section-1',
              order: 1,
            },
          ],
          wordCount: 900,
        },
      },
      form: {
        category: 'x-article',
        content: '<p>Section body</p>',
        label: 'Autonomous Content Systems',
        status: 'draft',
        summary: 'A deeper article about account-aware content.',
        tags: '',
      },
    });
    generateAccountContentMock.mockResolvedValue([{ id: 'post-1' }]);

    render(<ArticleDetail articleId="article-1" credentialId="cred-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Create X Post' }));

    await waitFor(() => {
      expect(generateAccountContentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 1,
          credential: 'cred-1',
          format: 'post',
          tone: 'professional',
          topic: expect.stringContaining('Autonomous Content Systems'),
        }),
      );
    });

    expect(pushMock).toHaveBeenCalledWith('/org-123/brand-123/posts/post-1');
  });

  it('forwards article SEO scoring from the sidebar', () => {
    const handleScoreSeo = vi.fn();
    useArticleDetailMock.mockReturnValue({
      ...defaultArticleDetailState(),
      article: {
        id: 'article-1',
        category: 'blog',
        content: '<p>Article body</p>',
        label: 'SEO Article',
        readingTime: 4,
        seoBreakdown: {
          breakdown: {
            contentStructure: 16,
            keywordPlacement: 18,
            links: 5,
            media: 7,
            metaOptimization: 10,
            readability: 12,
            technicalSignals: 8,
          },
          checks: [],
          meta: {
            fleschReadingEase: 61,
            keywordDensity: null,
            llmApplied: false,
            maxAvailable: 100,
            scoredAt: '2026-06-28T12:00:00.000Z',
            targetKeyword: null,
            wordCount: 820,
          },
          rating: 'good',
          suggestions: ['Add an internal link.'],
        },
        seoScore: 76,
        status: 'draft',
        summary: 'Article summary',
        wordCount: 820,
      },
      form: {
        category: 'blog',
        content: '<p>Article body</p>',
        label: 'SEO Article',
        status: 'draft',
        summary: 'Article summary',
        tags: '',
      },
      handleScoreSeo,
    });

    render(<ArticleDetail articleId="article-1" />);

    expect(screen.getByText('SEO Scorecard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Re-score SEO' }));

    expect(handleScoreSeo).toHaveBeenCalledTimes(1);
  });
});
