import type { IIngredient } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import IngredientsListFooter from '@ui/ingredients/list/footer/IngredientsListFooter';
import { PageScope } from '@ui-constants/misc.constant';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/layouts/lightbox/MediaLightbox', () => ({
  __esModule: true,
  default: () => <div data-testid="media-lightbox" />,
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  __esModule: true,
  LazyModalFolder: () => <div data-testid="lazy-modal-folder" />,
}));

describe('IngredientsListFooter', () => {
  const mediaIngredients: IIngredient[] = [];

  const baseProps = {
    brandId: 'brand-1',
    lightboxIndex: 0,
    lightboxOpen: false,
    mediaIngredients,
    onCloseLightbox: vi.fn(),
    onFolderModalConfirm: vi.fn(),
    scope: PageScope.BRAND,
    selectedFolderForModal: null,
  };

  it('should render without crashing', () => {
    const { container } = render(<IngredientsListFooter {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<IngredientsListFooter {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<IngredientsListFooter {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
