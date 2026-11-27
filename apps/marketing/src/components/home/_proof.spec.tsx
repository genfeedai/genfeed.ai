import { render, screen, within } from '@testing-library/react';
import { HomeProofView } from '@web-components/home/_proof';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <span
      aria-label={alt}
      data-src={typeof src === 'string' ? src : undefined}
      role="img"
    />
  ),
}));

const POST = {
  brandName: 'Koro',
  caption: 'New hire at my desk',
  id: 'post-one-aaaaaaaaaaaaaaaaaaaa',
  label: 'Koro sofa day carousel',
  platform: 'instagram',
  publishedAt: '2026-11-26T19:15:36.248Z',
  url: 'https://www.instagram.com/p/DgMtOipibiy',
};

const ARTICLE = {
  coverImageUrl: 'https://cdn.genfeed.ai/assets/cards/articles/a.jpg',
  id: 'article-1',
  label: 'The Content Abundance Era',
  publishedAt: '2026-11-20T08:00:00.000Z',
  url: '/@vincentshipsit/articles/the-content-abundance-era',
};

describe('HomeProofView', () => {
  it('opens each post on its platform and loads its picture through the proof route', () => {
    render(<HomeProofView articles={[]} posts={[POST]} />);

    const list = screen.getByRole('list', {
      name: 'Posts published with Genfeed',
    });
    const links = within(list).getAllByRole('link');
    for (const link of links) {
      expect(link).toHaveAttribute('href', POST.url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
    expect(
      screen.getByRole('img', { name: /Koro: Koro sofa day carousel/ }),
    ).toHaveAttribute('data-src', `/home-proof/${POST.id}`);
    expect(screen.getByText('26 Nov 2026')).toBeInTheDocument();
  });

  it('shows no view, like or follower number', () => {
    render(<HomeProofView articles={[ARTICLE]} posts={[POST]} />);

    expect(screen.queryByText(/\b(views?|likes?|followers?)\b/i)).toBeNull();
  });

  it('lists the articles with links to their pages', () => {
    render(<HomeProofView articles={[ARTICLE]} posts={[]} />);

    expect(
      screen.getByRole('link', { name: /The Content Abundance Era/ }),
    ).toHaveAttribute('href', ARTICLE.url);
  });

  it('renders nothing when there is nothing real to show', () => {
    const { container } = render(<HomeProofView articles={[]} posts={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
