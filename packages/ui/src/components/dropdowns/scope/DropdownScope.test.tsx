import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DropdownScope from '@ui/dropdowns/scope/DropdownScope';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPatch } = vi.hoisted(() => ({ mockPatch: vi.fn() }));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => ({ patch: mockPatch }) },
}));

vi.mock('@genfeedai/services/content/articles.service', () => ({
  ArticlesService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => () =>
    Promise.resolve(factory('test-token')),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

describe('DropdownScope', () => {
  beforeEach(() => vi.clearAllMocks());

  const item = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    scope: AssetScope.USER,
    status: IngredientStatus.GENERATED,
  } as IIngredient;

  it('shows the current scope on the control', () => {
    render(<DropdownScope item={item} />);

    expect(screen.getByRole('combobox', { name: /Privacy/ })).toHaveTextContent(
      /private|user/i,
    );
  });

  it('saves the chosen scope and hands the updated item to the parent', async () => {
    const updated = { ...item, scope: AssetScope.PUBLIC };
    mockPatch.mockResolvedValue(updated);
    const onScopeChange = vi.fn();
    const user = userEvent.setup();
    render(<DropdownScope item={item} onScopeChange={onScopeChange} />);

    await user.click(screen.getByRole('combobox', { name: /Privacy/ }));
    await user.click(screen.getByRole('option', { name: /public/i }));

    expect(mockPatch).toHaveBeenCalledExactlyOnceWith(item.id, {
      scope: AssetScope.PUBLIC,
    });
    expect(onScopeChange).toHaveBeenCalledWith(AssetScope.PUBLIC, updated);
  });
});
