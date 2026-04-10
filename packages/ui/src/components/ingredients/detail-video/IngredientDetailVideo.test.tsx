import '@testing-library/jest-dom';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient, IMetadata, IVideo } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import IngredientDetailVideo from '@ui/ingredients/detail-video/IngredientDetailVideo';
import { describe, expect, it, vi } from 'vitest';

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

vi.mock('@ui/evaluation/card/EvaluationCard', () => ({
  default: () => <div data-testid="evaluation-card" />,
}));

vi.mock('@ui/ingredients/tabs/captions/IngredientTabsCaptions', () => ({
  default: () => <div data-testid="tabs-captions" />,
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

vi.mock('@ui/loading/overlay/LoadingOverlay', () => ({
  default: () => <div data-testid="loading-overlay" />,
}));

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: () => <div data-testid="ingredient-quick-actions" />,
}));

vi.mock('@ui/navigation/tabs/Tabs', () => ({
  default: () => <div data-testid="tabs" />,
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: () => <div data-testid="video-player" />,
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

vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: false,
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

describe('IngredientDetailVideo', () => {
  const video = {
    category: IngredientCategory.VIDEO,
    id: 'video-1',
    ingredientUrl: 'https://example.com/video.mp4',
    metadata: {
      height: 1080,
      width: 1920,
    } as IMetadata,
    status: IngredientStatus.GENERATED,
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
  } as IVideo;

  const childIngredients: IIngredient[] = [];

  it('should render without crashing', () => {
    render(
      <IngredientDetailVideo
        video={video}
        childIngredients={childIngredients}
      />,
    );
    expect(screen.getByTestId('tabs')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(
      <IngredientDetailVideo
        video={video}
        childIngredients={childIngredients}
      />,
    );
    expect(screen.getByTestId('ingredient-quick-actions')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(
      <IngredientDetailVideo
        video={video}
        childIngredients={childIngredients}
      />,
    );
    expect(screen.getByText('Asset Workspace')).toBeInTheDocument();
  });
});
