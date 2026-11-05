import { paginatedResponse } from '@app-tests/paginated-response';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModalGallery from '@/components/modals/gallery/ModalGallery';
import type { IngredientsMediaGridProps } from '@/props/content/ingredient.props';

const library = vi.hoisted(() => ({
  items: [] as IIngredient[],
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findAllPage: async () => paginatedResponse([]),
  }),
}));

vi.mock('@/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: () => undefined,
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({ useUploadModal: () => ({ openUpload: vi.fn() }) }),
);

vi.mock('@/components/modals/gallery/hooks/useGalleryLibrary', () => ({
  GALLERY_LIBRARY_DEFAULT_SORT: 'createdAt: -1',
  useGalleryLibrary: () => ({
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    isStarredOnly: false,
    items: library.items,
    loadMore: async () => undefined,
    onClearFilters: () => undefined,
    onOriginsChange: () => undefined,
    onRefresh: () => undefined,
    onSearchChange: () => undefined,
    onSortChange: () => undefined,
    onStarredOnlyChange: () => undefined,
    origins: [],
    search: '',
    sort: 'createdAt: -1',
  }),
}));

// The grid's tiles are the shared masonry tiles; a tile is a button named by its asset.
vi.mock(
  '@/components/ingredients/list/media-grid/IngredientsMediaGrid',
  () => ({
    default: ({
      items,
      onClickIngredient,
      selectedIds = [],
    }: IngredientsMediaGridProps) => (
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button
              aria-pressed={selectedIds.includes(item.id)}
              onClick={() => onClickIngredient?.(item)}
              type="button"
            >
              {item.id}
            </button>
          </li>
        ))}
      </ul>
    ),
  }),
);

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, title }: { children: ReactNode; title?: string }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));

/** What the picker handed back, and whether it closed: the caller's view. */
function renderGallery(
  overrides: Partial<Parameters<typeof ModalGallery>[0]> = {},
) {
  const outcome = { isClosed: false, picks: [] as unknown[] };
  render(
    <ModalGallery
      category={IngredientCategory.IMAGE}
      isOpen
      onClose={() => {
        outcome.isClosed = true;
      }}
      onSelect={(items) => outcome.picks.push(items)}
      title="Pick media"
      {...overrides}
    />,
  );
  return outcome;
}

describe('ModalGallery', () => {
  beforeEach(() => {
    library.items = [
      { id: 'asset-1' } as IIngredient,
      { id: 'asset-2' } as IIngredient,
      { id: 'asset-3' } as IIngredient,
    ];
  });

  it('picks a single video on click and closes', () => {
    const outcome = renderGallery({ category: IngredientCategory.VIDEO });

    fireEvent.click(screen.getByRole('button', { name: 'asset-2' }));

    expect(outcome).toEqual({ isClosed: true, picks: [[{ id: 'asset-2' }]] });
  });

  it('collects several images and adds them together', () => {
    const outcome = renderGallery();

    fireEvent.click(screen.getByRole('button', { name: 'asset-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'asset-3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2' }));

    expect(outcome).toEqual({
      isClosed: true,
      picks: [[{ id: 'asset-1' }, { id: 'asset-3' }]],
    });
  });

  it('keeps already-attached media when one more is added', () => {
    const outcome = renderGallery({
      maxSelectableItems: 5,
      selectedReferences: ['asset-1', 'asset-2'],
    });

    expect(screen.getByRole('button', { name: 'asset-1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'asset-3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 3' }));

    expect(outcome.picks).toEqual([
      [{ id: 'asset-1' }, { id: 'asset-2' }, { id: 'asset-3' }],
    ]);
  });

  it('confirms a changed video choice instead of replacing it on click', () => {
    const outcome = renderGallery({
      category: IngredientCategory.VIDEO,
      selectedId: 'asset-1',
    });

    fireEvent.click(screen.getByRole('button', { name: 'asset-2' }));
    expect(outcome.picks).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add 1' }));

    expect(outcome.picks).toEqual([[{ id: 'asset-2' }]]);
  });
});
