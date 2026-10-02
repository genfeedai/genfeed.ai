import type { Article } from '@models/content/article.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticleDetail, {
  ArticleAbout,
  buildArticleApplyHref,
  formatArticlePublishedAt,
} from './article-detail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('./article-content', () => ({
  default: () => <div>article body</div>,
}));

vi.mock('@website/(content)/articles/article-cover', () => ({
  default: () => <div>cover</div>,
}));

describe('formatArticlePublishedAt', () => {
  it('formats publishedAt in UTC so SSR matches the client', () => {
    expect(formatArticlePublishedAt('2026-07-21T00:00:00.000Z')).toBe(
      'July 21, 2026',
    );
    expect(formatArticlePublishedAt('2026-07-21T23:00:00.000Z')).toBe(
      'July 21, 2026',
    );
  });
});

describe('ArticleAbout', () => {
  it('renders Genfeed as the publisher when an article has no brand', () => {
    render(<ArticleAbout />);

    expect(
      screen.getByRole('heading', { name: 'About Genfeed' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About Genfeed' })).toHaveAttribute(
      'href',
      '/about',
    );
    expect(screen.getByAltText('Genfeed logo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /twitter\/x/i })).toHaveAttribute(
      'href',
      'https://x.com/genfeedai',
    );
  });

  it('attributes a branded article to that brand', () => {
    const brand = {
      description: 'Independent stories about design and technology.',
      label: 'Lunar',
      logoUrl: 'https://cdn.genfeed.ai/logos/lunar.jpg',
      slug: 'lunar',
      twitterUrl: 'https://x.com/lunar',
    } as Article['brand'];

    render(<ArticleAbout brand={brand} />);

    expect(
      screen.getByRole('heading', { name: 'About Lunar' }),
    ).toBeInTheDocument();
    expect(screen.getByText(brand.description)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'More from Lunar' }),
    ).toHaveAttribute('href', '/u/lunar');
    expect(screen.getByRole('link', { name: /twitter\/x/i })).toHaveAttribute(
      'href',
      'https://x.com/lunar',
    );
  });
});

describe('ArticleDetail sticky aside', () => {
  it('parks the about card below the public topbar', () => {
    const article = {
      id: 'article-1',
      label: 'Show HN',
      slug: 'how-to-launch-an-open-source-product-on-show-hn-and-product-hunt',
    } as Article;

    const { container } = render(
      <ArticleDetail article={article} isPreview={false} />,
    );

    const sticky = container.querySelector('.lg\\:sticky');
    expect(sticky).toHaveClass('lg:top-24');
    expect(sticky).not.toHaveClass('lg:top-4');
  });
});

describe('buildArticleApplyHref', () => {
  it('links the guide to a new agent chat in the app', () => {
    const href = buildArticleApplyHref('A useful guide');

    expect(href).toMatch(/^https:\/\/app\.genfeed\.ai\/agent\/new\?prompt=/);
    expect(new URL(href).searchParams.get('prompt')).toContain(
      '"A useful guide"',
    );
  });
});

describe('Genfeed article resources', () => {
  const article = {
    id: 'article-1',
    label: 'Prompt guide',
    slug: 'how-to-prompt-ai-images-videos-and-audio',
  } as Article;
  it('offers a real free skill and public Pro offer on a Genfeed guide', () => {
    render(<ArticleDetail article={article} isPreview={false} />);
    expect(
      screen.getByRole('link', { name: 'Get the free skill' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/genfeedai/skills/tree/master/cinematic-prompting',
    );
    expect(
      screen.getByRole('link', { name: 'Explore Skills Pro' }),
    ).toHaveAttribute('href', '/skills');
  });
  it('keeps promotion out of unpublished previews', () => {
    render(<ArticleDetail article={article} isPreview />);
    expect(
      screen.queryByRole('link', { name: 'Get the free skill' }),
    ).not.toBeInTheDocument();
  });
  it('keeps Genfeed promotion out of a customer publication with the same slug', () => {
    render(
      <ArticleDetail
        article={
          {
            ...article,
            brand: { label: 'Customer', slug: 'customer' },
          } as Article
        }
        isPreview={false}
      />,
    );
    expect(
      screen.queryByRole('link', { name: 'Get the free skill' }),
    ).not.toBeInTheDocument();
  });
});
