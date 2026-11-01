import '@testing-library/jest-dom/vitest';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type {
  IImage,
  IIngredient,
  IMetadata,
} from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientDetailImage from '@/features/ingredients/detail-image/IngredientDetailImage';

vi.mock('@/components/evaluation/card/EvaluationCard', () => ({
  default: () => <div data-testid="evaluation-card" />,
}));

vi.mock(
  '@/features/ingredients/components/tabs/children/IngredientTabsChildren',
  () => ({
    default: () => <div data-testid="tabs-children" />,
  }),
);

vi.mock(
  '@/features/ingredients/components/tabs/info/IngredientTabsInfo',
  () => ({
    default: () => <div data-testid="tabs-info" />,
  }),
);

vi.mock(
  '@/features/ingredients/components/tabs/metadata/IngredientTabsMetadata',
  () => ({
    default: () => <div data-testid="tabs-metadata" />,
  }),
);

vi.mock('@/features/ingredients/tabs-posts/IngredientTabsPosts', () => ({
  default: () => <div data-testid="tabs-posts" />,
}));

vi.mock(
  '@/features/ingredients/components/ingredients/tabs/prompts/IngredientTabsPrompts',
  () => ({
    default: () => <div data-testid="tabs-prompts" />,
  }),
);

vi.mock(
  '@/features/ingredients/components/tabs/sharing/IngredientTabsSharing',
  () => ({
    default: () => <div data-testid="tabs-sharing" />,
  }),
);

vi.mock(
  '@/features/ingredients/components/tabs/tags/IngredientTabsTags',
  () => ({
    default: () => <div data-testid="tabs-tags" />,
  }),
);

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: () => <div data-testid="ingredient-quick-actions" />,
}));

vi.mock('@ui/primitives/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ui/primitives/tabs')>()),
  Tabs: () => <div data-testid="tabs" />,
}));

vi.mock('@ui/primitives/loading-overlay', () => ({
  default: () => <div data-testid="loading-overlay" />,
}));

vi.mock('@/hooks/ui/evaluation/use-evaluation/use-evaluation', () => ({
  useEvaluation: () => ({
    evaluate: vi.fn(),
    evaluation: null,
    isEvaluating: false,
  }),
}));

vi.mock(
  '@/features/ingredients/hooks/use-ingredient-metadata/use-ingredient-metadata',
  () => ({
    useIngredientMetadata: () => ({
      isUpdating: false,
      updateMetadata: vi.fn(),
    }),
  }),
);

vi.mock(
  '@/features/ingredients/hooks/use-ingredient-sharing/use-ingredient-sharing',
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

  it('renders the detail workspace without the redundant section label', () => {
    render(
      <IngredientDetailImage
        image={image}
        childIngredients={childIngredients}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Refine image details' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Asset Workspace')).not.toBeInTheDocument();
  });
});
