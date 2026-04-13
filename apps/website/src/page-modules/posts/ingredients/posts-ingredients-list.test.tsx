import PostsIngredientsList from '@pages/posts/ingredients/posts-ingredients-list';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';

const findPublicIngredientsMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/posts',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: () => '1',
  }),
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findPublicIngredients: findPublicIngredientsMock,
    }),
  },
}));

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: next/image is mocked to a basic DOM element in jsdom tests.
    <img alt={props.alt} src={props.src} />
  ),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <div data-testid="auto-pagination" />,
}));

describe('PostsIngredientsList', () => {
  it('keeps the public gallery route-based and links to the public ingredient page', async () => {
    findPublicIngredientsMock.mockResolvedValue([
      {
        category: 'wellness',
        id: 'ingredient-1',
        metadataLabel: 'Collagen',
        totalPosts: 2,
        totalViews: 50,
      },
    ]);

    render(<PostsIngredientsList />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /collagen/i })).toHaveAttribute(
        'href',
        '/posts/ingredient-1',
      );
    });
  });
});
