import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleCompose from './article-compose';
import '@testing-library/jest-dom';

const { articleDetailMock, searchParamValues, xArticleGenerateFormMock } =
  vi.hoisted(() => ({
    articleDetailMock: vi.fn(),
    searchParamValues: new Map<string, string>(),
    xArticleGenerateFormMock: vi.fn(),
  }));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => searchParamValues.get(key) ?? null),
  })),
}));

vi.mock('@ui/articles/x-article/XArticleGenerateForm', () => ({
  default: (props: unknown) => {
    xArticleGenerateFormMock(props);
    return <div data-testid="x-article-generate-form" />;
  },
}));

vi.mock('@ui/articles/type-selector/ArticleTypeSelector', () => ({
  default: () => <div data-testid="article-type-selector" />,
}));

vi.mock('./article-detail', () => ({
  default: (props: unknown) => {
    articleDetailMock(props);
    return <div data-testid="article-detail" />;
  },
}));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: vi.fn(() => ({
      copyRichTextToClipboard: vi.fn(),
      copyToClipboard: vi.fn(),
    })),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('ArticleCompose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamValues.clear();
  });

  it('should render without crashing', () => {
    const { container } = render(<ArticleCompose />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('opens X Article composer from query params with account context', () => {
    searchParamValues.set('type', 'x-article');
    searchParamValues.set('credentialId', 'cred-1');
    searchParamValues.set('prompt', 'Write the X Article');

    render(<ArticleCompose />);

    expect(xArticleGenerateFormMock).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        initialPrompt: 'Write the X Article',
      }),
    );
  });

  it('passes credential context to generated article detail', () => {
    searchParamValues.set('id', 'article-1');
    searchParamValues.set('credentialId', 'cred-1');

    render(<ArticleCompose />);

    expect(articleDetailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article-1',
        credentialId: 'cred-1',
      }),
    );
  });
});
