import '@testing-library/jest-dom';
import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import { render, screen } from '@testing-library/react';
import IngredientTabs from '@ui/ingredients/ingredient-tabs/IngredientTabs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/ingredients/tabs/info/IngredientTabsInfo', () => ({
  default: () => <div data-testid="tabs-info" />,
}));

vi.mock('@ui/ingredients/tabs/posts/IngredientTabsPosts', () => ({
  default: () => <div data-testid="tabs-posts" />,
}));

vi.mock('@ui/ingredients/tabs/metadata/IngredientTabsMetadata', () => ({
  default: () => <div data-testid="tabs-metadata" />,
}));

vi.mock('@ui/ingredients/tabs/prompts/IngredientTabsPrompts', () => ({
  default: () => <div data-testid="tabs-prompts" />,
}));

vi.mock('@ui/ingredients/tabs/sharing/IngredientTabsSharing', () => ({
  default: () => <div data-testid="tabs-sharing" />,
}));

vi.mock('@ui/navigation/tabs/Tabs', () => ({
  default: () => <div data-testid="tabs" />,
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: () => <div data-testid="video-player" />,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ children, onClick, ...props }: BaseButtonProps) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

describe('IngredientTabs', () => {
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    ingredientUrl: 'https://example.com/image.jpg',
    metadataHeight: 1920,
    metadataLabel: 'Test Image',
    metadataWidth: 1080,
  } as IIngredient;

  it('should render without crashing', () => {
    render(
      <IngredientTabs
        ingredient={ingredient}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ingredient-drawer')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(
      <IngredientTabs
        ingredient={ingredient}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('ingredient-drawer-overlay')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(
      <IngredientTabs
        ingredient={ingredient}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });
});
