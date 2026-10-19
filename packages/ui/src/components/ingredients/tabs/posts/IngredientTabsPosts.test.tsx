import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';
import { describe, expect, it, vi } from 'vitest';

const { getPostsMock } = vi.hoisted(() => ({ getPostsMock: vi.fn() }));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({
      getPosts: getPostsMock,
    }),
  },
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => {
  const service = { getPosts: (...args: unknown[]) => getPostsMock(...args) };
  const resolveService = async () => service;
  return { useAuthedService: () => resolveService };
});

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

vi.mock('@pages/posts/detail/PostDetailPanel', () => ({
  __esModule: true,
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-panel">{postId ?? 'closed'}</div>
  ),
}));

describe('IngredientTabsPosts', () => {
  const ingredient = {
    id: 'ingredient-1',
  } as IIngredient;

  it('should render without crashing', () => {
    getPostsMock.mockResolvedValue([]);
    const { container } = render(
      <IngredientTabsPosts ingredient={ingredient} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('opens a post in the sidebar from its row and links the title to the post page', async () => {
    getPostsMock.mockResolvedValue([
      {
        id: 'post-1',
        label: 'Spring teaser',
        platform: 'instagram',
        status: 'scheduled',
      },
    ]);

    render(<IngredientTabsPosts ingredient={ingredient} />);

    const link = await screen.findByRole('link', { name: 'Spring teaser' });
    expect(link).toHaveAttribute(
      'href',
      '/acme/moonrise/publishing/posts/post-1',
    );

    fireEvent.click(link);
    expect(screen.getByTestId('post-detail-panel')).toHaveTextContent('closed');

    fireEvent.click(screen.getByText('scheduled'));
    expect(screen.getByTestId('post-detail-panel')).toHaveTextContent('post-1');
  });
});
