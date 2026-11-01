import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  getModelCategoryBadgeColors,
  getModelProviderBadgeColors,
  getModelProviderLabel,
} from './model-badge.helper';

describe('model-badge.helper', () => {
  it('assigns a distinct category treatment to every model category', () => {
    const treatments = Object.values(ModelCategory).map((category) =>
      getModelCategoryBadgeColors(category),
    );

    expect(new Set(treatments).size).toBe(Object.values(ModelCategory).length);
  });

  it('assigns a distinct branded treatment to every inference provider', () => {
    const treatments = Object.values(ModelProvider).map((provider) =>
      getModelProviderBadgeColors(provider),
    );

    expect(new Set(treatments).size).toBe(Object.values(ModelProvider).length);
    expect(getModelProviderBadgeColors(ModelProvider.REPLICATE)).toMatchObject({
      textColor: '#F59E0B',
    });
    expect(getModelProviderBadgeColors(ModelProvider.FAL)).toMatchObject({
      textColor: '#06B6D4',
    });
    expect(getModelProviderBadgeColors()).toMatchObject({
      textColor: 'var(--color-muted-foreground)',
    });
  });

  it('uses the reviewed neutral Crun badge and exact provider label', () => {
    expect(getModelProviderLabel(ModelProvider.CRUN)).toBe('Crun');
    expect(getModelProviderBadgeColors(ModelProvider.CRUN)).toEqual(
      getModelProviderBadgeColors(),
    );
  });

  it.each([
    [ModelProvider.GOOGLE, 'Google Gemini API'],
    [ModelProvider.XAI, 'xAI'],
    [ModelProvider.BFL, 'Black Forest Labs'],
    [ModelProvider.RUNWAY, 'Runway'],
    [ModelProvider.OPENAI, 'OpenAI'],
  ])('labels the explicit direct provider %s', (provider, label) => {
    expect(getModelProviderLabel(provider)).toBe(label);
    expect(getModelProviderBadgeColors(provider)).not.toEqual(
      getModelProviderBadgeColors(),
    );
  });

  it('keeps the xAI text theme-aware', () => {
    expect(getModelProviderBadgeColors(ModelProvider.XAI).textColor).toBe(
      'var(--color-foreground)',
    );
  });

  it('labels providers with their product names', () => {
    expect(getModelProviderLabel(ModelProvider.FAL)).toBe('fal.ai');
    expect(getModelProviderLabel(ModelProvider.REPLICATE)).toBe('Replicate');
    expect(getModelProviderLabel(ModelProvider.OPENROUTER)).toBe('OpenRouter');
    expect(getModelProviderLabel('custom')).toBe('Custom');
    expect(getModelProviderLabel()).toBe('Unknown');
  });
});
