import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublishContentEditorPage from './PublishContentEditorPage';

const mocks = vi.hoisted(() => ({
  params: new Map<string, string>(),
}));

interface EditorMockProps {
  artifactId: string;
}

interface ShellMockProps {
  backHref: string;
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

vi.mock('./post-editor-content', () => ({
  default: ({ artifactId }: EditorMockProps) => (
    <div data-testid="post-editor">{artifactId}</div>
  ),
}));

vi.mock('../../../edit/artifact-editor-shell', () => ({
  default: ({ backHref, children, title }: ShellMockProps) => (
    <div>
      <a href={backHref}>Back to posts</a>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/main${path}`,
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mocks.params.get(key) ?? null,
  }),
}));

describe('PublishContentEditorPage', () => {
  beforeEach(() => {
    mocks.params.clear();
  });

  it.each([
    [null, 'post-editor'],
    ['post', 'post-editor'],
    ['article', 'article-editor'],
    ['newsletter', 'newsletter-editor'],
  ] as const)(
    'renders the %s kind with the canonical content id',
    (kind, testId) => {
      if (kind) {
        mocks.params.set('kind', kind);
      }

      render(<PublishContentEditorPage contentId="content-1" />);

      expect(screen.getByTestId(testId)).toHaveTextContent('content-1');
    },
  );

  it('shows a stable empty state for unsupported kind metadata', () => {
    mocks.params.set('kind', 'video');
    mocks.params.set('returnTo', '/acme/main/publish/posts?status=draft');

    render(<PublishContentEditorPage contentId="wrong-id" />);

    expect(
      screen.getByRole('heading', { name: 'Content not found' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to posts' })).toHaveAttribute(
      'href',
      '/acme/main/publish/posts?status=draft',
    );
    expect(screen.queryByTestId('post-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('article-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('newsletter-editor')).not.toBeInTheDocument();
  });
});
