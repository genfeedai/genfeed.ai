import type { IPost } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailPublicPosts from './BrandDetailPublicPosts';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return {
    useFormatter: () => ({
      dateTime: (value: Date) =>
        value.toLocaleDateString('en-US', { timeZone: 'UTC' }),
    }),
    useTranslations: translateFromCatalog,
  };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { website: 'https://genfeed.test' } },
}));

const launchPost = {
  createdAt: '2026-11-10T09:00:00.000Z',
  description: '<p>Public posts now live where your brand lives.</p>',
  id: 'post-1',
  ingredients: [
    {
      category: 'IMAGE',
      id: 'img-1',
      ingredientUrl: 'https://cdn.genfeed.test/cover.png',
      status: 'GENERATED',
    },
  ],
  label: 'We shipped the brand profile',
  platform: 'twitter',
  publishedAt: '2026-11-11T09:00:00.000Z',
  totalComments: 86,
  totalLikes: 1240,
  totalShares: 1,
} as unknown as IPost;

const textPost = {
  createdAt: '2026-11-07T09:00:00.000Z',
  description: 'Why we open sourced the whole studio',
  id: 'post-2',
  ingredients: [],
  totalLikes: 3,
} as unknown as IPost;

describe('BrandDetailPublicPosts', () => {
  it('shows each post with where it went out and how it performed', () => {
    render(
      <BrandDetailPublicPosts
        posts={[launchPost, textPost]}
        publicHandle="acme"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Public posts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('What visitors see on genfeed.test/@acme'),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', {
      name: /We shipped the brand profile/,
    });
    expect(link).toHaveAttribute(
      'href',
      'https://genfeed.test/@acme/posts/post-1',
    );
    expect(link).toHaveTextContent('X');
    expect(link).toHaveTextContent('1.2K');
    expect(link).toHaveTextContent('86 comments');
    expect(link).toHaveTextContent('1 repost');
  });

  it('labels a Genfeed-native post and defaults missing counts to zero', () => {
    render(<BrandDetailPublicPosts posts={[textPost]} publicHandle="acme" />);

    const link = screen.getByRole('link', {
      name: /Why we open sourced the whole studio/,
    });
    expect(link).toHaveTextContent('Genfeed');
    expect(link).toHaveTextContent('3 likes');
    expect(link).toHaveTextContent('0 comments');
    expect(link).toHaveTextContent('0 reposts');
  });

  it('links to the public profile', () => {
    render(<BrandDetailPublicPosts posts={[launchPost]} publicHandle="acme" />);

    expect(
      screen.getByRole('link', { name: 'Public profile' }),
    ).toHaveAttribute('href', 'https://genfeed.test/@acme');
  });

  it('offers to create a post when nothing is public yet', () => {
    render(
      <BrandDetailPublicPosts
        createHref="https://app.genfeed.test/acme/agent/new"
        posts={[]}
        publicHandle="acme"
      />,
    );

    expect(screen.getByText('No public posts yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a post' })).toHaveAttribute(
      'href',
      'https://app.genfeed.test/acme/agent/new',
    );
  });

  it('shows no links for a brand without a public profile', () => {
    render(<BrandDetailPublicPosts posts={[]} />);

    expect(screen.getByText('No public posts yet')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
