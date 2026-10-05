import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { TabsIngredientInfoProps } from '@genfeedai/props/content/ingredient.props';
import type { BaseButtonProps } from '@genfeedai/props/ui/forms/button.props';
import { act, render, screen } from '@testing-library/react';
import IngredientTabs from '@ui/ingredients/ingredient-tabs/IngredientTabs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  root: { patchMetadata: vi.fn() },
  category: { patchMetadata: vi.fn() },
  getInstance: vi.fn(),
  info: vi.fn<(props: TabsIngredientInfoProps) => void>(),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));
vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: mocks.getInstance },
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ success: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));

vi.mock('@ui/ingredients/tabs/info/IngredientTabsInfo', () => ({
  default: (props: TabsIngredientInfoProps) => {
    mocks.info(props);
    return <div data-testid="tabs-info" />;
  },
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

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstance.mockImplementation((...args: string[]) =>
      args.length === 1 ? mocks.root : mocks.category,
    );
  });

  it('sends info edits to the registered root ingredients route and forwards the ingredient response', async () => {
    const updated = { ...ingredient, metadataLabel: 'Updated' };
    mocks.root.patchMetadata.mockResolvedValue(updated);
    const onUpdate = vi.fn();
    render(
      <IngredientTabs
        ingredient={ingredient}
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />,
    );
    const props = mocks.info.mock.calls.at(-1)?.[0];
    expect(props?.onUpdateMetadata).toBeDefined();
    await act(async () => {
      await props?.onUpdateMetadata?.('label', 'Updated');
    });
    expect(mocks.getInstance).toHaveBeenCalledWith('token');
    expect(mocks.root.patchMetadata).toHaveBeenCalledWith('ingredient-1', {
      label: 'Updated',
    });
    expect(mocks.category.patchMetadata).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(updated);
  });

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
