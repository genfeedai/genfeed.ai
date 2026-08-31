import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleEditorContent from './content';

const mocks = vi.hoisted(() => ({
  params: new Map<string, string>(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: 'main',
    href: (path: string) => `/acme/main${path}`,
    orgHref: (path: string) => `/acme${path}`,
    orgSlug: 'acme',
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => ({
    get: (key: string) => mocks.params.get(key) ?? null,
  }),
}));

vi.mock('../article-detail', () => ({
  default: ({
    articleId,
    credentialId,
  }: {
    articleId: string;
    credentialId?: string;
  }) => (
    <div data-testid="article-detail">
      {articleId}
      {credentialId ? `:${credentialId}` : ''}
    </div>
  ),
}));

describe('ArticleEditorContent', () => {
  beforeEach(() => {
    mocks.params.clear();
  });

  it('renders the article editor for the deep-linked artifact', () => {
    mocks.params.set(
      'returnTo',
      '/acme/main/publishing/posts?type=article&status=draft',
    );
    mocks.params.set('credentialId', 'credential-1');

    render(<ArticleEditorContent artifactId="article-1" />);

    expect(screen.getByTestId('article-detail')).toHaveTextContent(
      'article-1:credential-1',
    );
    expect(
      screen.getByRole('link', { name: /back to articles/i }),
    ).toHaveAttribute(
      'href',
      '/acme/main/publishing/posts?type=article&status=draft',
    );
  });

  it('falls back to the articles list when no return target was carried', () => {
    render(<ArticleEditorContent artifactId="article-1" />);

    expect(screen.getByTestId('article-detail')).toHaveTextContent('article-1');
    expect(
      screen.getByRole('link', { name: /back to articles/i }),
    ).toHaveAttribute('href', '/acme/main/publishing/posts?type=article');
  });
});
