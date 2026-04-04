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
});
