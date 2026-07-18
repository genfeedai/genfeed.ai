import type { IIngredient } from '@genfeedai/interfaces';
import * as QuickActionsConfig from '@ui/quick-actions/config/quick-actions.config';
import { describe, expect, it, vi } from 'vitest';

describe('QuickActionsConfig', () => {
  it('should create action configurations correctly', () => {
    const mockIngredient = { id: '1', label: 'Test' } as Partial<IIngredient>;
    const mockHandler = vi.fn();
    const action = QuickActionsConfig.createPublishAction(
      mockIngredient,
      mockHandler,
    );
    expect(action).toBeDefined();
  });

  it('should expose configuration helpers', () => {
    expect(QuickActionsConfig.createPublishAction).toBeDefined();
  });

  it('exposes image variation as a contextual Remix action', () => {
    const ingredient = { id: 'ingredient-1' } as IIngredient;
    const handler = vi.fn();

    const action = QuickActionsConfig.createVariationAction(
      ingredient,
      handler,
    );

    expect(action).toMatchObject({
      id: 'remix',
      label: 'Remix',
      tooltip: 'Remix this image',
    });
    action?.onClick();
    expect(handler).toHaveBeenCalledWith(ingredient);
  });
});
