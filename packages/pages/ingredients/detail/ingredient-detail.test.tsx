import type { IIngredient } from '@genfeedai/contracts/interfaces';
import IngredientDetail from '@pages/ingredients/detail/ingredient-detail';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseIngredientDetail } = vi.hoisted(() => ({
  mockUseIngredientDetail: vi.fn(),
}));

vi.mock('@pages/ingredients/detail/use-ingredient-detail', () => ({
  useIngredientDetail: mockUseIngredientDetail,
}));

vi.mock('@pages/ingredients/detail/ingredient-detail-body', () => ({
  default: ({ ingredient }: { ingredient: IIngredient }) => (
    <div data-testid="ingredient-detail-body">{ingredient.id}</div>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ brandSlug: 'brand-1', orgSlug: 'org-1' })),
  usePathname: vi.fn(() => '/library/images/image-1'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

function buildDetailState(overrides: Record<string, unknown> = {}) {
  return {
    cachedLabel: '',
    childIngredients: [],
    credentials: [],
    findIngredient: vi.fn(),
    handlers: {},
    handleShareVideo: vi.fn(),
    handleTrimClose: vi.fn(),
    handleTrimConfirm: vi.fn(),
    handleTrimVideo: vi.fn(),
    handleUpdateMetadata: vi.fn(),
    handleUpdateSharing: vi.fn(),
    ingredient: null,
    isLoading: false,
    isTrimModalOpen: false,
    isUpdating: false,
    isUsingCache: false,
    loadingStates: {},
    pathname: '/library/images/image-1',
    ...overrides,
  };
}

function renderDetail() {
  return render(<IngredientDetail type="images" id="image-1" />);
}

describe('IngredientDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page shell while the ingredient is in flight', () => {
    mockUseIngredientDetail.mockReturnValue(
      buildDetailState({ isLoading: true }),
    );

    renderDetail();

    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(
      screen.getByTestId('ingredient-detail-skeleton'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('ingredient-detail-body'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Ingredient Not Found')).not.toBeInTheDocument();
  });

  it('renders the not-found state when no ingredient resolves', () => {
    mockUseIngredientDetail.mockReturnValue(buildDetailState());

    renderDetail();

    expect(screen.getByText('Ingredient Not Found')).toBeInTheDocument();
    expect(
      screen.queryByTestId('ingredient-detail-body'),
    ).not.toBeInTheDocument();
  });

  it('renders the detail body once the ingredient resolves', () => {
    mockUseIngredientDetail.mockReturnValue(
      buildDetailState({ ingredient: { id: 'image-1' } as IIngredient }),
    );

    renderDetail();

    expect(screen.getByTestId('ingredient-detail-body')).toHaveTextContent(
      'image-1',
    );
    expect(screen.queryByText('Ingredient Not Found')).not.toBeInTheDocument();
  });

  it('offers a cache retry banner when serving stale data', () => {
    const findIngredient = vi.fn();
    mockUseIngredientDetail.mockReturnValue(
      buildDetailState({
        cachedLabel: 'Jan 1, 2026, 10:00:00 AM',
        findIngredient,
        ingredient: { id: 'image-1' } as IIngredient,
        isUsingCache: true,
      }),
    );

    renderDetail();

    const retry = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retry);

    expect(findIngredient).toHaveBeenCalled();
  });
});
