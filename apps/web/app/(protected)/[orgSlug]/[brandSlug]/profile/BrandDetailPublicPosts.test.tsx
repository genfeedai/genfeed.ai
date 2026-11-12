import type { IPost } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
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
        onRetry={vi.fn()}
        posts={[launchPost, textPost]}
        publicHandle="acme"
        status="success"
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
    render(
      <BrandDetailPublicPosts
        onRetry={vi.fn()}
        posts={[textPost]}
        publicHandle="acme"
        status="success"
      />,
    );

    const link = screen.getByRole('link', {
      name: /Why we open sourced the whole studio/,
    });
    expect(link).toHaveTextContent('Genfeed');
    expect(link).toHaveTextContent('3 likes');
    expect(link).toHaveTextContent('0 comments');
    expect(link).toHaveTextContent('0 reposts');
  });

  it('links to the public profile', () => {
    render(
      <BrandDetailPublicPosts
        onRetry={vi.fn()}
        posts={[launchPost]}
        publicHandle="acme"
        status="success"
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Public profile' }),
    ).toHaveAttribute('href', 'https://genfeed.test/@acme');
  });

  it('offers to create a post when nothing is public yet', () => {
    render(
      <BrandDetailPublicPosts
        createHref="https://app.genfeed.test/acme/agent/new"
        onRetry={vi.fn()}
        posts={[]}
        publicHandle="acme"
        status="success"
      />,
    );

    expect(screen.getByText('No public posts yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a post' })).toHaveAttribute(
      'href',
      'https://app.genfeed.test/acme/agent/new',
    );
  });

  it('shows no links for a brand without a public profile', () => {
    render(
      <BrandDetailPublicPosts onRetry={vi.fn()} posts={[]} status="success" />,
    );

    expect(screen.getByText('No public posts yet')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a loading state, not the empty state, while posts load', () => {
    render(
      <BrandDetailPublicPosts
        createHref="https://app.genfeed.test/acme/agent/new"
        onRetry={vi.fn()}
        posts={[]}
        publicHandle="acme"
        status="pending"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading public posts…',
    );
    expect(screen.queryByText('No public posts yet')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Create a post' })).toBeNull();
  });

  it('offers a retry, not the empty state, when posts fail to load', () => {
    const onRetry = vi.fn();
    render(
      <BrandDetailPublicPosts
        createHref="https://app.genfeed.test/acme/agent/new"
        onRetry={onRetry}
        posts={[]}
        publicHandle="acme"
        status="error"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Public posts could not be loaded',
    );
    expect(screen.queryByText('No public posts yet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
