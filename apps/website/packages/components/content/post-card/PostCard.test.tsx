import type { IPost } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import PostCard from '@website/packages/components/content/post-card/PostCard';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: ComponentProps<'img'>) => (
    // biome-ignore lint/performance/noImgElement: next/image test double
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

const mockPost: Partial<IPost> = {
  category: 'video',
  id: 'post-1',
  ingredients: [
    {
      id: 'ingredient-1',
      metadataDuration: 120,
      metadataLabel: 'Test Ingredient',
      thumbnailUrl: 'https://example.com/thumb.jpg',
    },
  ],
  label: 'Test Post',
  platform: 'youtube',
  publicationDate: new Date('2024-01-03'),
  scheduledDate: new Date('2024-01-02'),
  status: 'published',
  uploadedAt: new Date('2024-01-01'),
  url: 'https://example.com/post',
};

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
