import type { IPost } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import { Ingredient } from '@website/models/content/ingredient.model';
import { Post } from '@website/models/content/post.model';
import PostCard from '@website/packages/components/content/post-card/PostCard';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: ComponentProps<'img'>) => (
    // biome-ignore lint/performance/noImgElement: next/image is mocked to a basic DOM element in jsdom tests.
    <img src={src} alt={alt} {...props} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockPost = new Post({
  category: 'video',
  id: 'post-1',
  ingredients: [
    new Ingredient({
      id: 'ingredient-1',
      metadataDuration: 120,
      metadataLabel: 'Test Ingredient',
      thumbnailUrl: 'https://example.com/thumb.jpg',
    }),
  ],
  label: 'Test Post',
  platform: 'youtube',
  publicationDate: '2024-01-03T00:00:00.000Z',
  scheduledDate: '2024-01-02T00:00:00.000Z',
  status: 'published',
  uploadedAt: '2024-01-01T00:00:00.000Z',
  url: 'https://example.com/post',
}) as IPost;

describe('PostCard', () => {
  it('should render without crashing', () => {
    render(<PostCard post={mockPost} />);
    expect(screen.getByText('Test Post')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<PostCard post={mockPost} />);

    const externalLink = screen.getByText('View');
    expect(externalLink).toBeInTheDocument();
    expect(externalLink.closest('a')).toHaveAttribute(
      'href',
      'https://example.com/post',
    );
    expect(externalLink.closest('a')).toHaveAttribute('target', '_blank');

    const ingredientLink = screen.getByText('Test Ingredient');
    expect(ingredientLink).toBeInTheDocument();
    expect(ingredientLink.closest('a')).toHaveAttribute(
      'href',
      '/ingredients/videos/ingredient-1',
    );
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <PostCard post={mockPost} className="custom-class" />,
    );
    const cardElement = container.firstChild as HTMLElement;

    expect(cardElement).toHaveClass('shadow-lg');
    expect(cardElement).toHaveClass('custom-class');
  });
});
