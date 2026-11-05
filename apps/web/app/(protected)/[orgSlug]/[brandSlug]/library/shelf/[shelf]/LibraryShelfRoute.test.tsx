import LibraryShelfRoute from '@app/(protected)/[orgSlug]/[brandSlug]/library/shelf/[shelf]/LibraryShelfRoute';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryBrowserProps } from '@/features/library/props/library-browser.props';

const route = vi.hoisted(() => ({ shelf: undefined as string | undefined }));

vi.mock('@genfeedai/hooks/navigation/use-route-params', () => ({
  useRouteParams: () => ({ shelf: route.shelf }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/features/library/browser/library-browser', () => ({
  default: ({ shelf }: LibraryBrowserProps) => <h1>Shelf {shelf}</h1>,
}));
vi.mock('@/features/ingredients/list/ingredients-list', () => ({
  default: () => null,
}));
vi.mock(
  '@/components/ingredients/list/media-grid/IngredientsMediaGrid',
  () => ({
    IngredientsMediaGridSkeleton: () => <p>Loading shelf</p>,
  }),
);

describe('LibraryShelfRoute', () => {
  beforeEach(() => {
    route.shelf = undefined;
  });

  it('shows the grid skeleton in the prerendered shell, before the shelf is known', () => {
    render(<LibraryShelfRoute />);

    expect(screen.getByText('Loading shelf')).toBeInTheDocument();
  });

  it('opens the browser on the shelf named by the path', () => {
    route.shelf = 'needs-review';
    render(<LibraryShelfRoute />);

    expect(
      screen.getByRole('heading', { name: 'Shelf needs-review' }),
    ).toBeInTheDocument();
  });

  it('is not found for a segment that names no shelf', () => {
    route.shelf = 'nope';

    expect(() => render(<LibraryShelfRoute />)).toThrow('NEXT_NOT_FOUND');
  });
});
