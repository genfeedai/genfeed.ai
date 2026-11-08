import type { Article } from '@models/content/article.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ArticlesList from './articles-list';

const ARTICLE = {
  id: 'a1',
  label: 'Shipping faster',
  slug: 'shipping-faster',
} as unknown as Article;

describe('ArticlesList header', () => {
  it('names the page and points to publishing and the community', () => {
    render(<ArticlesList articles={[]} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Written by the Genfeed community',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Explore the community' }),
    ).toHaveAttribute('href', '/community');
    expect(screen.getByRole('link', { name: 'Publish yours' })).toHaveAttribute(
      'href',
      expect.stringContaining('sign-up'),
    );
    expect(screen.getByText('No articles published yet')).toBeInTheDocument();
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

  it('links back from a page past the end', () => {
    render(
      <ArticlesList
        articles={[]}
        pagination={{ page: 9, total: 30, totalPages: 3 }}
      />,
    );

    expect(screen.getByRole('link', { name: '3' })).toHaveAttribute(
      'href',
      '?page=3',
    );
  });
});

describe('ArticlesList creator links', () => {
  it.each([
    [ARTICLE, '/@genfeedai/articles/shipping-faster', '@genfeedai ·'],
    [
      { ...ARTICLE, brand: { slug: 'shayla' } } as unknown as Article,
      '/@shayla/articles/shipping-faster',
      '@shayla ·',
    ],
  ])('files each article under its creator', (article, href, byline) => {
    render(<ArticlesList articles={[article]} />);

    expect(
      screen.getByRole('link', { name: /Shipping faster/ }),
    ).toHaveAttribute('href', href);
    expect(screen.getByText(byline)).toBeInTheDocument();
  });
});
