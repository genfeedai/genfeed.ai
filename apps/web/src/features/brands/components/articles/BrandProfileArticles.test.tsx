import type { Article } from '@models/content/article.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandProfileArticles from './BrandProfileArticles';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand-one${path}` }),
}));

function article(id: string, label: string): Article {
  return {
    id,
    label,
    publishedAt: '2026-11-24T08:00:00.000Z',
    readingTime: 4,
    summary: `${label} summary`,
  } as Article;
}

describe('BrandProfileArticles', () => {
  it('lists each published article as a link to its editor with date and reading time', () => {
    render(<BrandProfileArticles articles={[article('a-1', 'First')]} />);

    const link = screen.getByRole('link', { name: 'Open First' });
    expect(link).toHaveAttribute(
      'href',
      '/acme/brand-one/publishing/posts/a-1',
    );
    expect(link).toHaveTextContent('Nov 24, 2026');
    expect(link).toHaveTextContent('4 min read');
  });

  it('tells the owner what an empty list means', () => {
    render(<BrandProfileArticles articles={[]} />);

    expect(
      screen.getByRole('heading', { name: 'No published articles yet.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Published articles appear here and on your public profile.',
      ),
    ).toBeInTheDocument();
  });

  it('says so when the articles could not be loaded', () => {
    render(<BrandProfileArticles articles={[]} isError />);

    expect(
      screen.getByRole('heading', { name: 'Could not load articles.' }),
    ).toBeInTheDocument();
  });
});
