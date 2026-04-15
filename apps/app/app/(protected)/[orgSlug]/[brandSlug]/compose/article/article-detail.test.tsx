import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleDetail from './article-detail';
import '@testing-library/jest-dom';

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/pages/use-article-detail/use-article-detail', () => ({
  useArticleDetail: vi.fn(() => ({
    article: null,
    error: null,
    form: {
      category: 'blog',
      content: '',
      label: '',
      status: 'draft',
    },
    handleArchive: vi.fn(),
    handleDelete: vi.fn(),
    handleEnhance: vi.fn(),
    handlePublish: vi.fn(),
    handleSave: vi.fn(),
    isDirty: false,
    isEnhancing: false,
    isLoading: false,
    isSaving: false,
    pathname: '/org-123/brand-123/compose/article',
    setFormField: vi.fn(),
  })),
}));

vi.mock('@hooks/pages/use-x-article-compose/use-x-article-compose', () => ({
  useXArticleCompose: vi.fn(() => ({
    handleCopyFullArticle: vi.fn(),
    handleCopySection: vi.fn(),
    handleDownloadImage: vi.fn(),
    handleGenerateHeaderImage: vi.fn(),
    isGeneratingImage: false,
  })),
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({
    id: 'article-123',
  })),
  usePathname: vi.fn(() => '/org-123/brand-123/compose/article'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
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

describe('ArticleDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<ArticleDetail />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
