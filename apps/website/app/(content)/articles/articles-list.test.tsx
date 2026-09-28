import type { Article } from '@models/content/article.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticlesList from './articles-list';

vi.mock('@ui/card/empty/CardEmpty', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

const ARTICLE = {
  id: 'a1',
  label: 'Shipping faster',
  slug: 'shipping-faster',
} as unknown as Article;

describe('ArticlesList empty state', () => {
  it('retains the page H1 and a same-origin internal link', () => {
    render(<ArticlesList articles={[]} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Articles' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Genfeed features' }),
    ).toHaveAttribute('href', '/features');
  });
});

describe('ArticlesList pagination', () => {
  it('links to the other pages the API reported', () => {
    render(
      <ArticlesList
        articles={[ARTICLE]}
        pagination={{ page: 1, total: 30, totalPages: 3 }}
      />,
    );

    expect(screen.getByText('30 articles')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      '?page=2',
    );
    expect(screen.getByText('1').closest('a')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows no page links when there are no articles', () => {
    render(
      <ArticlesList
        articles={[]}
        pagination={{ page: 1, total: 0, totalPages: 1 }}
      />,
    );

    expect(screen.queryByText('0 articles')).toBeNull();
  });
});
