import { IngredientCategory } from '@genfeedai/enums';
import CanvasGallery from '@pages/studio/gallery/CanvasGallery';
import { render, screen } from '@testing-library/react';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const mockOpenGallery = vi.fn();
const mockUseFindAll = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/crud/use-crud/use-crud', () => ({
  useFindAll: (...args: unknown[]) => mockUseFindAll(...args),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useGalleryModal: () => ({
    openGallery: mockOpenGallery,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('CanvasGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mockUseFindAll.mockReturnValue({
      data: [
        {
          id: 'asset-1',
          ingredientUrl: 'https://example.com/a.png',
          status: 'completed',
        },
      ],
      isLoading: false,
    });
  });

  it('should render without crashing', () => {
    const { container } = render(
      <CanvasGallery categoryType={IngredientCategory.IMAGE} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies the shared scroll-focus shadow to the focused asset item', () => {
    render(
      <CanvasGallery
        categoryType={IngredientCategory.IMAGE}
        scrollFocusedIngredientId="asset-1"
      />,
    );

    expect(screen.getByTestId('canvas-gallery-item-asset-1')).toHaveClass(
      SCROLL_FOCUS_SURFACE_CLASS,
    );
  });
});
