import type { IModel } from '@genfeedai/contracts/interfaces';
import { usePromptBarPricing } from '@hooks/prompt-bar/use-prompt-bar-pricing/use-prompt-bar-pricing';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const createMockModel = (overrides: Partial<IModel> = {}): IModel =>
  ({
    cost: 10,
    id: 'model-1',
    name: 'Test Model',
    pricingType: 'flat',
    provider: 'test',
    ...overrides,
  }) as IModel;

describe('usePromptBarPricing', () => {
  describe('Flat Pricing', () => {
    it('defaults to flat pricing when pricingType is undefined', () => {
      const model = createMockModel({ cost: 25, pricingType: undefined });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      expect(result.current.selectedModelCost).toBe(25);
    });
  });

  describe('Per-Megapixel Pricing', () => {
    it('uses 1080x1920 as default dimensions', () => {
      const model = createMockModel({
        cost: 10,
        costPerUnit: 5,
        pricingType: 'per-megapixel',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: undefined,
          watchedOutputs: 1,
          watchedWidth: undefined,
        }),
      );

      // 1080 * 1920 = 2,073,600 pixels = 2.0736 megapixels
      // 2.0736 * 5 = 10.368, ceil = 11
      expect(result.current.selectedModelCost).toBe(11);
    });

    it('falls back to model cost when width is 0', () => {
      const model = createMockModel({
        cost: 15,
        costPerUnit: 5,
        pricingType: 'per-megapixel',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 0, // 0 causes fallback to model.cost
        }),
      );

      // When width is 0, falls back to model.cost (15)
      expect(result.current.selectedModelCost).toBe(15);
    });
  });

  describe('Per-Second Pricing', () => {
    it('uses 8 seconds as default duration', () => {
      const model = createMockModel({
        cost: 10,
        costPerUnit: 3,
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: undefined,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      // 8 seconds * 3 credits = 24
      expect(result.current.selectedModelCost).toBe(24);
    });

    it('falls back to model cost when duration is 0', () => {
      const model = createMockModel({
        cost: 12,
        costPerUnit: 2,
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [model],
          watchedDuration: 0, // 0 causes fallback to model.cost
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      // When duration is 0, falls back to model.cost (12)
      expect(result.current.selectedModelCost).toBe(12);
    });
  });

  describe('calculateModelCost function', () => {
    it('calculateModelCost works for per-second pricing', () => {
      const model = createMockModel({
        costPerUnit: 5,
        minCost: 10,
        pricingType: 'per-second',
      });

      const { result } = renderHook(() =>
        usePromptBarPricing({
          selectedModels: [],
          watchedDuration: 8,
          watchedHeight: 1920,
          watchedOutputs: 1,
          watchedWidth: 1080,
        }),
      );

      // 10 seconds * 5 = 50
      const cost = result.current.calculateModelCost(model, 1080, 1920, 10);
      expect(cost).toBe(50);
    });
  });
});
