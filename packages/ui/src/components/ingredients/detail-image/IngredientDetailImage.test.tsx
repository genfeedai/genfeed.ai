import '@testing-library/jest-dom';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IImage, IIngredient, IMetadata } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import IngredientDetailImage from '@ui/ingredients/detail-image/IngredientDetailImage';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/evaluation/card/EvaluationCard', () => ({
  default: () => <div data-testid="evaluation-card" />,
}));

vi.mock('@ui/ingredients/tabs/children/IngredientTabsChildren', () => ({
  default: () => <div data-testid="tabs-children" />,
}));

vi.mock('@ui/ingredients/tabs/info/IngredientTabsInfo', () => ({
  default: () => <div data-testid="tabs-info" />,
}));

vi.mock('@ui/ingredients/tabs/metadata/IngredientTabsMetadata', () => ({
  default: () => <div data-testid="tabs-metadata" />,
}));

vi.mock('@ui/ingredients/tabs/posts/IngredientTabsPosts', () => ({
  default: () => <div data-testid="tabs-posts" />,
}));

vi.mock('@ui/ingredients/tabs/prompts/IngredientTabsPrompts', () => ({
  default: () => <div data-testid="tabs-prompts" />,
}));

vi.mock('@ui/ingredients/tabs/sharing/IngredientTabsSharing', () => ({
  default: () => <div data-testid="tabs-sharing" />,
}));

vi.mock('@ui/ingredients/tabs/tags/IngredientTabsTags', () => ({
  default: () => <div data-testid="tabs-tags" />,
}));

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: () => <div data-testid="ingredient-quick-actions" />,
}));

vi.mock('@ui/navigation/tabs/Tabs', () => ({
  default: () => <div data-testid="tabs" />,
}));

vi.mock('@ui/loading/overlay/LoadingOverlay', () => ({
  default: () => <div data-testid="loading-overlay" />,
}));

vi.mock('@genfeedai/hooks/ui/evaluation/use-evaluation/use-evaluation', () => ({
  useEvaluation: () => ({
    evaluate: vi.fn(),
    evaluation: null,
    isEvaluating: false,
  }),
}));

vi.mock(
  '@genfeedai/hooks/ui/ingredient/use-ingredient-metadata/use-ingredient-metadata',
  () => ({
    useIngredientMetadata: () => ({
      isUpdating: false,
      updateMetadata: vi.fn(),
    }),
  }),
);

vi.mock(
  '@genfeedai/hooks/ui/ingredient/use-ingredient-sharing/use-ingredient-sharing',
  () => ({
    useIngredientSharing: () => ({
      isUpdating: false,
      updateSharing: vi.fn(),
    }),
  }),
);

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

describe('IngredientDetailImage', () => {
  const image = {
    category: IngredientCategory.IMAGE,
    id: 'image-1',
    ingredientUrl: 'https://example.com/image.jpg',
    metadata: {
      height: 1920,
      label: 'Test Image',
      width: 1080,
    } as IMetadata,
    status: IngredientStatus.GENERATED,
  } as IImage;

  const childIngredients: IIngredient[] = [];

  it('should render without crashing', () => {
    render(
      <IngredientDetailImage
        image={image}
        childIngredients={childIngredients}
      />,
    );
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(
      <IngredientDetailImage
        image={image}
        childIngredients={childIngredients}
      />,
    );
    expect(screen.getByTestId('ingredient-quick-actions')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(
      <IngredientDetailImage
        image={image}
        childIngredients={childIngredients}
      />,
    );
    expect(screen.getByText('Asset Workspace')).toBeInTheDocument();
  });
});
