import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  getModelCategoryBadgeClass,
  getModelProviderBadgeClass,
  getModelProviderLabel,
} from './model-badge.helper';

describe('model-badge.helper', () => {
  it('assigns a distinct category treatment to every model category', () => {
    const treatments = Object.values(ModelCategory).map((category) =>
      getModelCategoryBadgeClass(category),
    );

    expect(new Set(treatments).size).toBe(Object.values(ModelCategory).length);
  });

  it('assigns a distinct branded treatment to every inference provider', () => {
    const treatments = Object.values(ModelProvider).map((provider) =>
      getModelProviderBadgeClass(provider),
    );

    expect(new Set(treatments).size).toBe(Object.values(ModelProvider).length);
    expect(getModelProviderBadgeClass(ModelProvider.REPLICATE)).toContain(
      '#D97706',
    );
    expect(getModelProviderBadgeClass(ModelProvider.FAL)).toContain('#06B6D4');
    expect(getModelProviderBadgeClass()).toContain('muted');
  });

  it('labels providers with their product names', () => {
    expect(getModelProviderLabel(ModelProvider.FAL)).toBe('fal.ai');
    expect(getModelProviderLabel(ModelProvider.REPLICATE)).toBe('Replicate');
    expect(getModelProviderLabel(ModelProvider.OPENROUTER)).toBe('OpenRouter');
    expect(getModelProviderLabel('custom')).toBe('Custom');
    expect(getModelProviderLabel()).toBe('Unknown');
  });
});
