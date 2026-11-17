import type { IPost } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientUsedInPosts from './IngredientUsedInPosts';

const query = vi.hoisted(() => ({
  data: undefined as IPost[] | undefined,
}));

vi.mock('@hooks/auth/use-authed-query/use-authed-query', () => ({
  useAuthedQuery: () => ({ data: query.data }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand${path}` }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('IngredientUsedInPosts', () => {
  beforeEach(() => {
    query.data = undefined;
  });

  it('links each post that uses the asset to its post page', () => {
    query.data = [
      { id: 'post-1', label: 'Winter carousel' },
      { id: 'post-2', label: '  ' },
    ] as IPost[];

    render(<IngredientUsedInPosts ingredientId="asset-1" />);

    expect(
      screen.getByRole('region', { name: 'Used in posts' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Winter carousel' }),
    ).toHaveAttribute('href', '/acme/brand/publishing/posts/post-1');
    expect(screen.getByRole('link', { name: 'Untitled post' })).toHaveAttribute(
      'href',
      '/acme/brand/publishing/posts/post-2',
    );
  });

  it('renders nothing for an asset no post uses', () => {
    query.data = [];

    const { container } = render(
      <IngredientUsedInPosts ingredientId="asset-1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
